import { createError } from "h3";

export default defineEventHandler(async event => {
  const sessionAdmin = event.context.auth.admin;
  const Admin = getModel('Admin');
  
  const admin = await Admin.findById(sessionAdmin?._id).select('fullName avatarUrl');
  
  if (!admin) {
    throw createError({
      statusCode: 401,
      statusMessage: "UnAuthorized"
    });
  }

  const userId = getRouterParam(event, "userId");
  const Chat = getModel('Chat');

  // Use aggregation pipeline in findOneAndUpdate for efficient slicing
  const chat = await Chat.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    {
      upsert: true,
      new: true
    }
  ).then(async (chat) => {
    // Use aggregation to get only last 6 messages
    const result = await Chat.aggregate([
      { $match: { _id: chat._id } },
      {
        $project: {
          user: 1,
          notes: 1,
          messages: { $slice: ['$messages', -6] }
        }
      }
    ]);
    
    // Populate the result
    await Chat.populate(result[0], [
      {
        path: 'user',
        select: '_id personalInfo avatarUrl'
      },
      {
        path: 'messages.author',
        select: 'personalInfo fullName avatarUrl'
      }
    ]);
    
    return result[0];
  });

  // Safety check
  if (!chat || !chat.user) {
    throw createError({
      statusCode: 404,
      message: 'Chat or user not found'
    });
  }

  return {
    currentUser: {
      _id: admin._id,
      fullName: admin.fullName,
      avatarUrl: admin.avatarUrl,
    },
    otherUser: {
      _id: chat.user._id,
      fullName: `${chat.user.personalInfo?.firstName || 'Not Set'} ${chat.user.personalInfo?.lastName || 'Not Set'}`,
      avatarUrl: chat.user.avatarUrl,
    },
    messages: chat.messages?.map(message => ({
      _id: message._id,
      textContent: message.textContent,
      attachments: message.attachments || [],
      author: {
        _id: message.author._id,
        fullName: message?.author.fullName || 
          `${message?.author.personalInfo?.firstName || ''} ${message?.author.personalInfo?.lastName || ''}`.trim() || 'N/A',
        avatarUrl: message.author.avatarUrl,
      },
      createdAt: message.createdAt,
      deliveredAt: message.deliveredAt,
      seenAt: message.seenAt
    })) || [],
    notes: chat.notes || []
  };
});