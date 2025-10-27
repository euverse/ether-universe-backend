export default defineEventHandler(async event => {
  const query = getQuery(event);
  const offset = parseInt(query.offset) || 0; // Should be 0-based for offset
  const limit = parseInt(query.limit) || 20;
  const search = query.search || '';

  const Chat = getModel("Chat");

  try {
    // Build search filter
    const searchFilter = {};

    if (search) {
      // Search in user name or recent message content
      const User = getModel("User");

      // Find users matching the search term
      const matchingUsers = await User.find({
        name: { $regex: search, $options: 'i' }
      }).select('_id').lean();

      const userIds = matchingUsers.map(u => u._id);

      searchFilter.$or = [
        { user: { $in: userIds } },
        { 'messages.textContent': { $regex: search, $options: 'i' } }
      ];
    }

    // Get total count for pagination
    const totalChats = await Chat.countDocuments(searchFilter);

    // Fetch chats with populated user data
    const chats = await Chat.find(searchFilter)
      .select('user messages createdAt updatedAt')
      .sort({ updatedAt: -1 }) // Sort by last activity
      .skip(offset)
      .limit(limit)
      .populate('user', '_id personalInfo avatarUrl')
      .lean();

    // Transform data to expected format
    const formattedChats = chats.map(chat => {
      // Get the most recent message
      const recentMessage = chat.messages && chat.messages.length > 0
        ? chat.messages[chat.messages.length - 1]
        : null;

      // Count unread messages (messages with status 'delivered' from non-user authors)
      const unreadMessages = chat.messages.filter(msg =>
        msg.status === 'delivered' &&
        msg.type !== 'user'
      ).length;

      return {
        user: {
          _id: chat.user._id.toString(),
          fullName: chat.user.personalInfo?.firstName || 'Unknown User',
          avatarUrl: chat.user.avatarUrl
        },
        recentMessage: recentMessage ? recentMessage.textContent : 'No messages yet',
        recentMessageTime: recentMessage ? recentMessage.createdAt : chat.createdAt,
        unreadMessages: unreadMessages,
        lastActivity: chat.updatedAt
      };
    });

    return {
      chats: formattedChats,
      pagination: {
        currentPage: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(totalChats / limit),
        totalItems: totalChats,
        itemsPerPage: limit
      }
    };

  } catch (error) {
    console.error('Error fetching chat history:', error);
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch chat history'
    });
  }
});