export default appErrorHandler(async (event) => {
    const query = getQuery(event);
    const offset = parseInt(query.offset) || 0;
    const limit = parseInt(query.limit) || 20;
    const search = query.query || '';
    const accountStatus = query.accountStatus || '';

    const User = getModel('User');
    const KYCSubmission = getModel('KYCSubmission');
    const Balance = getModel('Balance');

    let filter = {};
    if (search) {
        filter.$or = [
            { "personalInfo.firstName": { $regex: search, $options: 'i' } },
            { "personalInfo.lastName": { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
        ];
    }

    if (accountStatus) {
        filter.accountStatus = accountStatus;
    }

    const users = await User.find(filter)
        .select('personalInfo.firstName personalInfo.lastName email auth.status auth.lastLoggedInAt trading.biasedPositive createdAt')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean();

    const totalUsers = await User.countDocuments(filter);

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

        let totalActiveUSDTAllocations = 0, totalUSDTAllocations = 0;

        try {
            const { totals: { total: totalActiveUSDTAllocationsResult } } = await getAllocationForPair({ userId: user._id }, "USDT", { active: true });
            totalActiveUSDTAllocations = totalActiveUSDTAllocationsResult
        } catch { }

        try {
            const { totals: { total: totalUSDTAllocationsResult } } = await getAllocationForPair({ userId: user._id }, "USDT");
            totalUSDTAllocations = totalUSDTAllocationsResult;
        } catch { }


        const Chat = getModel('Chat');

        const userChat = await Chat.findOne({ user: user._id }).select('messages').lean()
        const unreadMessages = userChat ? userChat.messages.filter(message => !message.seenAt).length : 0

        const userFullName = user.personalInfo?.firstName ? `${user.personalInfo?.firstName} ${user.personalInfo?.lastName || ''}` : 'Unverified User';

        return {
            _id: user._id,
            fullName: userFullName,
            kycStatus,
            activeUSDTAllocations: Math.round(totalActiveUSDTAllocations),
            totalUSDTAllocations: Math.round(totalUSDTAllocations),
            userStatus: user.auth.status || 'active',
            balanceUsd: Math.round(totalBalanceUsd),
            unreadMessages,
            biasedPositive: user.trading.biasedPositive ?? false,
            createdAt: user.createdAt,
            lastLogin: user.auth.lastLoggedInAt
        };
    }));

    const filteredUsers = enrichedUsers.filter(user => user !== null);

    return {
        users: filteredUsers,
        pagination: {
            currentPage: Math.floor(offset / limit) + 1,
            totalPages: Math.ceil(totalUsers / limit),
            totalItems: totalUsers,
            itemsPerPage: limit
        }
    };

});