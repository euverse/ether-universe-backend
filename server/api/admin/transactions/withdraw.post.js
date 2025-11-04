
export default defineEventHandler(async (event) => {
    const { baseAsset, recipientAddress, amount, purpose, notes } = await readAndValidateBody(event, {
        include: ['baseAsset', 'recipientAddress', 'amount'],
        customValidators: {
            amount: amount => amount > 0
        }
    });

    try {
        const sessionAdmin = event.context.auth.admin

        await createAdminWithdrawal({
            adminId: sessionAdmin._id,
            baseAsset,
            amount, // human-readable
            recipientAddress,
            purpose,
            notes,
        })

        return {
            success: true
        };

    } catch (error) {
        if (error.statusCode) throw error;

        console.error('Transfer transaction error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: error.message || 'Failed to process transfer'
        });
    }
});