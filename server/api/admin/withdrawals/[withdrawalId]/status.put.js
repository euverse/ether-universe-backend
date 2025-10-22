

export default defineEventHandler(async (event) => {
    const admin = event.context.admin;

    if (!admin) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }

    const withdrawalId = event.context.params.withdrawalId;
    const { status, transactionHash, rejectionReason } = await readBody(event);

    const validStatuses = ['approved', 'rejected'];
    if (!status || !validStatuses.includes(status)) {
        throw createError({
            statusCode: 400,
            statusMessage: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
    }

    if (status === 'approved' && !transactionHash) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Transaction hash is required when approving withdrawal'
        });
    }

    if (status === 'rejected' && !rejectionReason) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Rejection reason is required when rejecting withdrawal'
        });
    }

    try {
        const Transaction = getModel('Transaction');
        const Balance = getModel('Balance');
        const withdrawal = await Transaction.findById(withdrawalId);

        if (!withdrawal) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Withdrawal not found'
            });
        }
        if (withdrawal.status !== 'pending') {
            throw createError({
                statusCode: 400,
                statusMessage: `Withdrawal already ${withdrawal.status}`
            });
        }

        const now = new Date();

        withdrawal.status = status;
        withdrawal.processedBy = admin.id;
        withdrawal.processedAt = now;

        if (status === 'approved') {
            withdrawal.transactionHash = transactionHash;
            withdrawal.completedAt = now;
        } else if (status === 'rejected') {
            withdrawal.rejectionReason = rejectionReason;
            withdrawal.rejectedAt = now;

            const userBalance = await Balance.findOne({
                userId: withdrawal.userId,
                pairId: withdrawal.pairId
            });

            if (userBalance) {
                const currentBalance = parseFloat(userBalance.balance);
                const withdrawalAmount = parseFloat(withdrawal.amount);
                const newBalance = currentBalance + withdrawalAmount;

                userBalance.balance = newBalance.toString();
                await userBalance.save();
            }
        }

        await withdrawal.save();

        return {
            withdrawalId: withdrawal._id,
            userId: withdrawal.userId,
            status: withdrawal.status,
            transactionHash: withdrawal.transactionHash || null,
            processedAt: withdrawal.processedAt
        };

    } catch (error) {
        if (error.statusCode) throw error;

        console.error('Update withdrawal status error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to update withdrawal status'
        });
    }
});