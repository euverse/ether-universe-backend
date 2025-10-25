import { MESSAGE_TYPES } from "~/db/schemas/Chat";


export default defineEventHandler(async event => {
    const userId = getRouterParam(event, "userId");

    if (!userId) {
        throw createError({
            statusCode: 400,
            statusMessage: "User Id is required"
        });
    }

    const query = getQuery(event);

    // Parse query parameters
    const beforeDate = query.before ? new Date(query.before) : new Date();
    const limit = parseInt(query.limit) || 20; // Default to 20 messages

    // Validate beforeDate
    if (isNaN(beforeDate.getTime())) {
        throw createError({
            statusCode: 400,
            statusMessage: "Invalid date format for 'before' parameter"
        });
    }

    const Chat = getModel("Chat");

    // Use aggregation to filter messages at database level
    const result = await Chat.aggregate([
        // Match the user's chat
        { $match: { user: userId } },

        // Unwind messages array to work with individual messages
        { $unwind: '$messages' },

        // Filter messages before the specified date
        { $match: { 'messages.createdAt': { $lt: beforeDate } } },

        // Sort messages by creation date (descending for pagination)
        { $sort: { 'messages.createdAt': -1 } },

        // Limit the number of messages
        { $limit: limit },

        // Group back to get chat structure
        {
            $group: {
                _id: '$_id',
                // Preserve the original 'user' field from the chat document
                user: { $first: '$user' },
                messages: { $push: '$messages' }
            }
        },

        // Reverse messages to get chronological order
        {
            $project: {
                _id: 1,
                user: 1, // Include the 'user' field
                messages: { $reverseArray: '$messages' }
            }
        },

        // 💡 Add the $lookup stage here to populate the 'user' field
        {
            $lookup: {
                from: 'users',
                localField: 'user', // Field from the input documents (from the $group stage)
                foreignField: '_id', // Field from the 'users' collection
                as: 'user' // The name for the new array field to add to the input documents
            }
        },

        // 💡 Add $unwind to de-array the 'user' field (since it's a one-to-one relationship)
        {
            $unwind: '$user'
        }
    ]);

    if (!result || result.length === 0) {
        return {
            chatId: null,
            messages: []
        };
    }

    const chat = result[0];

    // Map messages to desired format
    const formattedMessages = chat.messages.map(message => ({
        _id: message._id,
        type: message.type,
        textContent: message.textContent,
        attachments: message.attachments || [],
        author: message.author ? {
            _id: message.author._id,
            ...(message.type == MESSAGE_TYPES.USER && {
                fullName: user.personalInfo.firstName,
                avatarUrl: user.avatarUrl
            })
        } : null,
        createdAt: message.createdAt,
        deliveredAt: message.deliveredAt,
        seenAt: message.seenAt
    }));

    return {
        chatId: chat._id,
        messages: formattedMessages
    };
});