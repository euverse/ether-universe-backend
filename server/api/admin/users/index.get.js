

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 20;
        const search = query.search || '';
        const kycStatus = query.kycStatus || '';
        const accountStatus = query.accountStatus || '';

        const User = getModel('User');
        const KYCSubmission = getModel('KYCSubmission');
        const Balance = getModel('Balance');

        let filter = {};
        if (search) {
            filter.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        if (accountStatus) {
            filter.accountStatus = accountStatus;
        }

        const skip = (page - 1) * limit;
        const users = await User.find(filter)
            .select('personalInfo.firstName personalInfo.lastName email auth.status createdAt auth.lastLoggedInAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalItems = await User.countDocuments(filter);
        const totalPages = Math.ceil(totalItems / limit);

        const enrichedUsers = await Promise.all(users.map(async (user) => {

            let kycStatus = 'notSubmitted'

            const kycSubmission = await KYCSubmission.findOne({ user: user._id })
                .sort({ createdAt: -1 })
                .lean();

            if (kycSubmission) {
                kycStatus = kycSubmission.status
            }

            const balances = await Balance.find({ userId: user._id }).lean();
            const totalBalanceUsd = balances.reduce((sum, balance) => {
                return sum + parseFloat(balance.balanceUsd || 0);
            }, 0);

            const allocatedAmountUsd = 0;

            const Chat = getModel('Chat');

            const userChat = await Chat.findOne({ user: user._id }).select('messages').lean()
            const unreadMessages = userChat ? userChat.messages.filter(message => !message.seenAt).length : 0

            const userFullName = user.personalInfo?.firstName ? `${user.personalInfo?.firstName} ${user.personalInfo?.lastName || ''}` : 'Unverified User';

            return {
                _id: user._id,
                fullName: userFullName,
                kycStatus,
                allocatedAmountUsd: Math.round(allocatedAmountUsd),
                userStatus: user.auth.status || 'active',
                balanceUsd: Math.round(totalBalanceUsd),
                unreadMessages,
                createdAt: user.createdAt,
                lastLogin: user.auth.lastLoggedInAt
            };
        }));

        const filteredUsers = enrichedUsers.filter(user => user !== null);

        return {
            users: filteredUsers,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems,
                itemsPerPage: limit
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