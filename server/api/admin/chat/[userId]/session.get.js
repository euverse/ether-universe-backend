import { createError } from "h3";
import { MESSAGE_TYPES } from "../../../../db/schemas/Chat";

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
        select: '_id id personalInfo avatarUrl auth.status attrs'
      }
    ]);

    return result[0];
  });



  const userName = `${chat.user.personalInfo?.firstName || 'Unverified User'}`

  return {
    user: {
      _id: chat.user._id,
      id: chat.user.id,
      status: chat.user.auth.status,
      attrs: chat.user.attrs,
      avatarUrl: chat.user.avatarUrl
    },
    currentUser: {
      _id: admin._id,
    },
    otherUser: {
      _id: chat.user._id,
      fullName: userName,
      avatarUrl: chat.user.avatarUrl,
    },
    messages: chat.messages?.map(message => ({
      _id: message._id,
      textContent: message.textContent,
      attachments: message.attachments || [],
      author: {
        _id: message.author._id,
        ...(message.type == MESSAGE_TYPES.USER && {
          fullName: userName,
          avatarUrl: chat.user.avatarUrl
        })
      },
      createdAt: message.createdAt,
      deliveredAt: message.deliveredAt,
      seenAt: message.seenAt
    })) || [],
    notes: chat.notes || []
  };
});