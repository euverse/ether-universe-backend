import { ACCOUNT_TYPES } from "../db/schemas/TradingAccount";

export default defineEventHandler(async (event) => {
  try {

    const sessionUser = event.context.auth.user;

    const { fromAsset, toAsset, amount } = await readAndValidateBody(event, {
      include: ['fromAsset', 'toAsset', 'amount'],
      customValidators: {
        amount: amount => amount > 0
      }
    });



    if (fromAsset === toAsset) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot exchange the same pair'
      });
    }

    const TradingAccount = getModel("TradingAccount");

    const realAccount = await TradingAccount.findOne({
      user: sessionUser._id,
      type: ACCOUNT_TYPES.REAL
    })

    if (!realAccount) {
      throw createError({
        statusCode: 403,
        statusMessage: "User has not real trading account"
      })

    }

    const Pair = getModel("Pair");

    const fromPair = await Pair.findOne({
      baseAsset: fromAsset
    })

    const toPair = await Pair.findOne({
      baseAsset: toAsset
    })

    if (!fromPair || !toPair) {

      throw createError({
        statusCode: 400,
        statusMessage: "From pair or to pair missing"
      })
    }

    const exchangeRate = fromPair.valueUsd / toPair.valueUsd

    const toAmount = exchangeRate * amount;

    await removeUserWithdrawalFromAggregateTotal(
      realAccount._id,
      fromAsset,
      amount
    )

    await addUserDeposit(
      realAccount._id,
      toAsset,
      toAmount
    )

    return {
      success: true
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