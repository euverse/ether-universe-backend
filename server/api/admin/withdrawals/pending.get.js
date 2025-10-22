
export default defineEventHandler(async (event) => {
    const admin = event.context.admin;
    
    if (!admin) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }

    try {
        const query = getQuery(event);
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 20;
        const status = query.status;

        const Deposit = getModel('Deposit');
        const User = getModel('User');
        const TradingPair = getModel('TradingPair');
        const Wallet = getModel('Wallet');

        const filter = {};
        
        if (status) {
            filter.status = status;
        } else {
            // Default to pending/confirming/confirmed (not yet allocated)
            filter.status = { $in: ['pending', 'confirming', 'confirmed'] };
        }

        const skip = (page - 1) * limit;
        const deposits = await Deposit.find(filter)
            .sort({ detectedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalItems = await Deposit.countDocuments(filter);
        const totalPages = Math.ceil(totalItems / limit);

        const enrichedDeposits = await Promise.all(deposits.map(async (deposit) => {
            const user = await User.findById(deposit.user)
                .select('id walletAddress email personalInfo')
                .lean();

            const pair = await TradingPair.findById(deposit.tradingPair)
                .select('symbol baseAsset name logoUrl')
                .lean();

            const wallet = await Wallet.findById(deposit.wallet)
                .select('network address')
                .lean();

            return {
                depositId: deposit.depositId,
                _id: deposit._id,
                user: {
                    userId: user?.id || 'N/A',
                    walletAddress: user?.walletAddress || 'N/A',
                    email: user?.email || 'N/A',
                    name: user?.personalInfo 
                        ? `${user.personalInfo.firstName || ''} ${user.personalInfo.lastName || ''}`.trim() 
                        : 'N/A'
                },
                network: deposit.network || wallet?.network || 'N/A',
                symbol: pair?.baseAsset || pair?.symbol || 'N/A',
                name: pair?.name || 'N/A',
                logoUrl: pair?.logoUrl,
                amount: deposit.amount,
                amountUsd: deposit.amountUsd,
                status: deposit.status,
                confirmations: deposit.confirmations,
                requiredConfirmations: deposit.requiredConfirmations,
                txHash: deposit.txHash,
                fromAddress: deposit.fromAddress,
                toAddress: deposit.toAddress,
                blockNumber: deposit.blockNumber,
                virtualBalanceAllocated: deposit.virtualBalanceAllocated,
                allocatedAmount: deposit.allocatedAmount,
                allocationRatio: deposit.allocationRatio,
                detectedAt: deposit.detectedAt,
                confirmedAt: deposit.confirmedAt,
                allocatedAt: deposit.allocatedAt
            };
        }));

        return {
            deposits: enrichedDeposits,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems,
                itemsPerPage: limit
            }
        };

    } catch (error) {
        console.error('[admin/deposits/pending.get] Error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to fetch deposits'
        });
    }
});