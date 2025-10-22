import { MESSAGE_STATUSES } from "~/db/schemas/Chat";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const offset = parseInt(query.offset) || 0;
        const limit = parseInt(query.limit) || 20;
        const search = query.search || '';
        const kycStatus = query.status || null;

        const KYCSubmission = getModel('KYCSubmission');
        const User = getModel('User');
        const Chat = getModel('Chat');

        // Build user filter
        let filter = {};

        // If filtering by KYC status, get those users first
        if (kycStatus) {
            const kycSubmissions = await KYCSubmission.find({ status: kycStatus })
                .select('user')
                .lean();
            filter._id = { $in: kycSubmissions.map(submission => submission.user) };
        }

        // Add search filter
        if (search) {
            filter.$or = [
                { 'personalInfo.firstName': { $regex: search, $options: 'i' } },
                { 'personalInfo.lastName': { $regex: search, $options: 'i' } }
            ];
        }

        // Get users
        const users = await User.find(filter)
            .select('personalInfo.firstName personalInfo.lastName createdAt')
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .lean();

        const total = await User.countDocuments(filter);

        // Enrich users with KYC document type and unread messages
        const enrichedUsers = await Promise.all(users.map(async (user) => {
            const kycSubmission = await KYCSubmission.findOne({ user: user._id })
                .select('documentType')
                .sort({ createdAt: -1 })
                .lean();

            // Count unread messages for this user
            const chat = await Chat.findOne({
                user: user._id,
            }).select('messages');

            const unreadMessages = (chat?.messages || []).filter(message => message.status === MESSAGE_STATUSES.DELIVERED).length;


            return {
                _id: user._id,
                fullName: `${user.personalInfo?.firstName || ''} ${user.personalInfo?.lastName || ''}`.trim() || 'N/A',
                documentType: kycSubmission?.documentType || null,
                unreadMessages,
                createdAt: user.createdAt
            };
        }));

        return {
            submissions: enrichedUsers,
            pagination: {
                offset,
                total,
                limit
            }
        };
    } catch (error) {
        console.error('Get users error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to fetch users'
        });
    }
});