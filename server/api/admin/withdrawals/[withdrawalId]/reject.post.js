import { model } from 'mongoose';

export default defineEventHandler(async (event) => {
    try {
        const admin = event.context.admin;

        if (!admin) {
          throw createError({
            statusCode: 401,
            statusMessage: "Unauthorized",
          });
        }

        const withdrawalId = getRouterParam(event, 'withdrawalId');
        
        if (!withdrawalId) {
            throw createError({ statusCode: 400, message: 'Withdrawal ID is required' });
        }

        const body = await readBody(event);
        const { rejectionReason, rejectionDetails = [] } = body;

        if (!rejectionReason) {
            throw createError({ 
                statusCode: 400, 
                message: 'Rejection reason is required' 
            });
        }

        const Withdrawal = model('Withdrawal');
        const Balance = model('Balance');

        const withdrawal = await Withdrawal.findOne({ withdrawalId })
            .populate('wallet')
            .populate('tradingPair');

        if (!withdrawal) {
            throw createError({ statusCode: 404, message: 'Withdrawal not found' });
        }

        if (withdrawal.status !== 'pending') {
            throw createError({
                statusCode: 400,
                message: `Cannot reject withdrawal with status: ${withdrawal.status}`
            });
        }

        // Unlock the balance
        const balance = await Balance.findOne({
            wallet: withdrawal.wallet._id,
            tradingPair: withdrawal.tradingPair._id
        });

        if (balance) {
            const requestedAmount = parseFloat(withdrawal.requestedAmount);
            const currentLocked = parseFloat(balance.locked);
            
            balance.locked = Math.max(0, currentLocked - requestedAmount).toFixed(6);
            await balance.save();
        }

        // Update withdrawal status
        withdrawal.status = 'rejected';
        withdrawal.rejectionReason = rejectionReason;
        withdrawal.rejectionDetails = rejectionDetails;
        withdrawal.reviewedAt = new Date();
        // withdrawal.reviewedBy = admin._id; // Uncomment when admin auth is added

        await withdrawal.save();

        console.log(`[admin/withdrawals/reject] Rejected: ${withdrawalId} - ${rejectionReason}`);

        return {
            success: true,
            withdrawalId: withdrawal.withdrawalId,
            status: withdrawal.status,
            rejectionReason: withdrawal.rejectionReason,
            message: 'Withdrawal rejected successfully'
        };

    } catch (error) {
        console.error('[admin/withdrawals/reject.post] Error:', error);
        throw createError({
            statusCode: error.statusCode || 500,
            message: error.message || 'Failed to reject withdrawal'
        });
    }
});