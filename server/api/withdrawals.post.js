
export default defineEventHandler(async (event) => {
  try {
    const sessionUser = event.context.auth?.user;

    const { baseAsset, network, amount, recipientAddress } = await readAndValidateBody(event, {
      include: ['baseAsset', 'network', 'amount', 'recipientAddress'],
      customValidators: {
        amount: amount => amount > 0
      }
    });


    await createUserWithdrawal({
      userId: sessionUser._id,
      network,
      baseAsset,
      amount,
      recipientAddress
    })

    return {
      success: true
    };
  } catch (error) {
    console.error('Withdraw Error:', error.message || error);

    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to process withdraw'
    });
  }
});