
export default defineEventHandler(async (event) => {
    const { admin } = event.context.auth;

    try {
        const User = getModel('User');
        const KYCSubmission = getModel('KYCSubmission');
        const Balance = getModel('Balance');
        const Transaction = getModel('Transaction');
        
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const calculatePercentage = (current, previous) => {
            if (previous === 0) return 0;
            return parseFloat(((current - previous) / previous * 100).toFixed(2));
        };

        const totalUsers = await User.countDocuments();
        const usersYesterday = await User.countDocuments({
            createdAt: { $lte: yesterday }
        });
        const usersPercentage = calculatePercentage(totalUsers, usersYesterday);

        const pendingVerifications = await KYCSubmission.countDocuments({
            status: 'pending'
        });
        const pendingYesterday = await KYCSubmission.countDocuments({
            status: 'pending',
            createdAt: { $lte: yesterday }
        });
        const verificationsPercentage = calculatePercentage(pendingVerifications, pendingYesterday);

        const unreadMessages = await KYCSubmission.countDocuments({
            status: 'pending'
        });
        const unreadYesterday = await KYCSubmission.countDocuments({
            status: 'pending',
            createdAt: { $lte: yesterday }
        });
        const unreadPercentage = calculatePercentage(unreadMessages, unreadYesterday);

        const balances = await Balance.aggregate([
            {
                $group: {
                    _id: null,
                    totalBalanceUsd: { $sum: { $toDouble: '$balanceUsd' } }
                }
            }
        ]);
        const totalAssetsUsd = balances.length > 0 ? balances[0].totalBalanceUsd : 0;

        const balancesYesterday = await Balance.aggregate([
            {
                $match: {
                    updatedAt: { $lte: yesterday }
                }
            },
            {
                $group: {
                    _id: null,
                    totalBalanceUsd: { $sum: { $toDouble: '$balanceUsd' } }
                }
            }
        ]);
        const totalAssetsYesterday = balancesYesterday.length > 0 ? balancesYesterday[0].totalBalanceUsd : 0;
        const assetsPercentage = calculatePercentage(totalAssetsUsd, totalAssetsYesterday);

        const pendingWithdrawals = await Transaction.countDocuments({
            type: 'withdrawal',
            status: 'pending'
        });
        const withdrawalsYesterday = await Transaction.countDocuments({
            type: 'withdrawal',
            status: 'pending',
            createdAt: { $lte: yesterday }
        });
        const withdrawalsPercentage = calculatePercentage(pendingWithdrawals, withdrawalsYesterday);

    
        const frozenUsers = await User.countDocuments({
            accountStatus: 'frozen'
        });
        const frozenYesterday = await User.countDocuments({
            accountStatus: 'frozen',
            updatedAt: { $lte: yesterday }
        });
        const frozenPercentage = calculatePercentage(frozenUsers, frozenYesterday);

        return {
            users: {
                total: totalUsers,
                percentageChange24h: usersPercentage
            },
            pendingVerification: {
                total: pendingVerifications,
                percentageChange24h: verificationsPercentage
            },
            unreadMessages: {
                total: unreadMessages,
                percentageChange24h: unreadPercentage
            },
            assetsAllocation: {
                total: Math.round(totalAssetsUsd),
                percentageChange24h: assetsPercentage
            },
            withdrawalApproval: {
                total: pendingWithdrawals,
                percentageChange24h: withdrawalsPercentage
            },
            freezedFunds: {
                total: frozenUsers,
                percentageChange24h: frozenPercentage
            }
        };

    } catch (error) {
        console.error('Analytics overview error:', error.message || error);
        throw createError({
            statusCode: 500,
            statusMessage: error.message || 'Failed to fetch analytics'
        });
    }
});