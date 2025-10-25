import { createError } from "h3";
import { MESSAGE_TYPES } from "../../db/schemas/Chat";

export default defineEventHandler(async event => {
    const sessionUser = event.context.auth.user;
    const User = getModel('User');

    const user = await User.findById(sessionUser?._id);

    if (!user) {
        throw createError({
            statusCode: 401,
            statusMessage: "UnAuthorized"
        });
    }

    const userId = sessionUser?._id;
    const Chat = getModel('Chat');

    const chat = await Chat.findOneAndUpdate(
        { user: userId },
        { $setOnInsert: { user: userId } },
        {
            new: true,
            upsert: true,
            // The aggregation pipeline is passed as the third argument here
            pipeline: [
                // Stage 1: Slice the 'messages' array to keep only the last 20 elements
                { $set: { messages: { $slice: ['$messages', -20] } } },
                // Stage 2: Project the final document shape
                { $project: { user: 1, notes: 1, messages: 1 } }
            ]
        }
    ).exec();

    const Admin = getModel("Admin");
    const admin = await Admin.findOne().select("_id fullName avatarUrl")

    if (!admin) {
        throw createError({
            statusCode: 404,
            statusMessage: "Other User not found"
        })
    }

    const adminFirstName = admin.fullName.split(' ')[0]

    return {
        otherUser: {
            _id: admin._id,
            fullName: adminFirstName,
            avatarUrl: admin.avatarUrl,
        },
        currentUser: {
            _id: user._id,
        },
        messages: chat.messages?.map(message => ({
            _id: message._id,
            textContent: message.textContent,
            attachments: message.attachments || [],
            author: {
                _id: message.author._id,
                ...(message.type == MESSAGE_TYPES.ADMIN && {
                    fullName: adminFirstName,
                    avatarUrl: admin.avatarUrl
                })
            },
            createdAt: message.createdAt,
            deliveredAt: message.deliveredAt,
            seenAt: message.seenAt
        })) || [],
    };
});