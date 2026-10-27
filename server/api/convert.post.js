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

    // Per-account mutex: reject a second conversion while one is already in
    // flight for this account, so a confused re-click can't apply twice.
    const CONVERT_LOCK_MS = 15000;

    const lockedAccount = await TradingAccount.findOneAndUpdate(
      {
        _id: realAccount._id,
        $or: [
          { convertLockExpiresAt: null },
          { convertLockExpiresAt: { $lt: new Date() } }
        ]
      },
      { convertLockExpiresAt: new Date(Date.now() + CONVERT_LOCK_MS) }
    );

    if (!lockedAccount) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A conversion is already in progress for this account'
      });
    }

    try {
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

      // Credit a deterministic network for the destination asset instead of
      // letting addUserDeposit fall back to an arbitrary Balance document
      // when the asset has balances on more than one network.
      const { byNetwork } = await getTotalBalanceForPair(realAccount._id, toAsset);
      const networksWithBalance = Object.entries(byNetwork)
        .sort((a, b) => parseFloat(b[1].available) - parseFloat(a[1].available));
      const targetNetwork = (networksWithBalance.length && parseFloat(networksWithBalance[0][1].available) > 0)
        ? networksWithBalance[0][0]
        : toPair.networks[0];

      const session = await mongoose.startSession();

      try {
        await session.withTransaction(async () => {
          await removeUserWithdrawalFromAggregateTotal(
            realAccount._id,
            fromAsset,
            amount,
            { session }
          )

          await addUserDeposit(
            realAccount._id,
            toAsset,
            toAmount,
            targetNetwork,
            { session }
          )
        });
      } finally {
        await session.endSession();
      }

      return {
        success: true
      };
    } finally {
      await TradingAccount.updateOne(
        { _id: realAccount._id },
        { convertLockExpiresAt: null }
      );
    }
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