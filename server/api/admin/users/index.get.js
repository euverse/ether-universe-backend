

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
            .select('firstName lastName email walletAddress accountStatus createdAt lastLoginAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalItems = await User.countDocuments(filter);
        const totalPages = Math.ceil(totalItems / limit);

        const enrichedUsers = await Promise.all(users.map(async (user) => {
            let kycData = {
                status: 'notSubmitted',
                imageType: null,
                fileType: null,
                submittedAt: null,
                approvedAt: null
            };

            const kycSubmission = await KYCSubmission.findOne({ user: user._id })
                .sort({ createdAt: -1 })
                .lean();

            if (kycSubmission) {
                kycData = {
                    status: kycSubmission.status,
                    imageType: kycSubmission.documentType,
                    fileType: 'image',
                    submittedAt: kycSubmission.createdAt,
                    approvedAt: kycSubmission.approvedAt || null
                };
            }

            if (kycStatus && kycData.status !== kycStatus) {
                return null;
            }

            const balances = await Balance.find({ userId: user._id }).lean();
            const totalBalanceUsd = balances.reduce((sum, balance) => {
                return sum + parseFloat(balance.balanceUsd || 0);
            }, 0);

            const allocatedAmountUsd = 0; 

            const unreadMessages = 0; 

            return {
                _id: user._id,
                fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'N/A',
                email: user.email || 'N/A',
                walletAddress: user.walletAddress,
                kyc: kycData,
                allocatedAmountUsd: Math.round(allocatedAmountUsd),
                accountStatus: user.accountStatus || 'active',
                balanceUsd: Math.round(totalBalanceUsd),
                unreadMessages,
                createdAt: user.createdAt,
                lastLogin: user.lastLoginAt || user.createdAt
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