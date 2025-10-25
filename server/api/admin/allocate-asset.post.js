
export default defineEventHandler(async (event) => {
    const { userId, amount, baseAsset } = await readAndValidateBody(event, {
        include: ['userId', 'amount', 'baseAsset'],
        customValidators: {
            amount: amount => amount > 0
        }
    });

    try {
        await createAllocation(
            userId,
            baseAsset,
            amount
        );

        return {
            success: true
        };

    } catch (error) {
        if (error.statusCode) throw error;

        console.error('Asset allocation error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: error.message || 'Failed to allocate asset'
        });
    }
});