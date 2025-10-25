import { WITHDRAWAL_STATUSES } from "~/db/schemas/UserWithdrawal";

export default defineEventHandler(async (event) => {

    const sessionAdmin = event.context.auth.admin;

    const withdrawalId = getRouterParam(event, "id");
    const { status, rejectionReason, rejectionDetails } = await readAndValidateBody(event, {
        include: ['status'],
        customValidators: {
            status: status => [WITHDRAWAL_STATUSES.APPROVED, WITHDRAWAL_STATUSES.REJECTED].includes(status)
        }
    });


    if (status === WITHDRAWAL_STATUSES.REJECTED && !rejectionReason) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Rejection reason is required when rejecting withdrawal'
        });
    }

    try {
        if (status === WITHDRAWAL_STATUSES.APPROVED) {
            await approveUserWithdrawal(withdrawalId, sessionAdmin._id)
        } else if (status === WITHDRAWAL_STATUSES.REJECTED) {
            await rejectUserWithdrawal(withdrawalId, sessionAdmin._id, rejectionReason, rejectionDetails)
        }

        return {
            success: true,
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