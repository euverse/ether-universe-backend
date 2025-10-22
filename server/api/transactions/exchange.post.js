

export default defineEventHandler(async (event) => {
  try {
  
    const sessionUser = event.context.auth?.user;

    if (!sessionUser || !sessionUser._id) {
      throw createError({
        statusCode: 401,
        statusMessage: 'User not authenticated. Please login first'
      });
    }

    const body = await readBody(event);

    if (!body.fromPairId || !body.forPairId || body.amount === undefined) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required fields: fromPairId, forPairId, amount'
      });
    }

    const { fromPairId, forPairId, amount } = body;

    if (typeof amount !== 'number' || amount <= 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Amount must be a positive number'
      });
    }

    if (fromPairId === forPairId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot exchange the same pair'
      });
    }

    const Pair = getModel('Pair');

    const fromPair = await Pair.findById(fromPairId);
    const toPair = await Pair.findById(forPairId);

    if (!fromPair || !toPair) {
      throw createError({
        statusCode: 404,
        statusMessage: 'One or both trading pairs not found'
      });
    }

    if (fromPair.valueUsd <= 0 || toPair.valueUsd <= 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid pricing data for one or both pairs'
      });
    }

    const exchangeRate = fromPair.valueUsd / toPair.valueUsd;
    const toAmount = amount * exchangeRate;

    console.log(`Exchange successful for user: ${sessionUser.email}`, {
      userId: sessionUser._id,
      from: fromPair.symbol,
      to: toPair.symbol,
      amount,
      toAmount: toAmount.toFixed(8)
    });

    return {
      message: 'successful'
    };
  } catch (error) {
    console.error('Exchange Error:', error.message || error);

    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to process exchange'
    });
  }
});