export default defineEventHandler(async (event) => {
  const user = event.context.auth.user;
  const accountId = getQuery(event).accountId || user.currentTradingAccountId;

  if (!accountId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'accountId is required'
    });
  }

  const Wallet = getModel('Wallet');
  const Balance = getModel('Balance');

  // Get all wallets for account
  const wallets = await Wallet.find({ tradingAccount: accountId }).select('_id').lean();

  if (wallets.length === 0) {
    return { wallets: [] };
  }

  // Get all balances for these wallets
  const balances = await Balance.find({
    wallet: { $in: wallets.map(w => w._id) }
  })
    .select('pair')
    .populate({
      path: 'pair',
      select: 'logoUrl name baseAsset'
    })
    .lean();

  // Group by pair, remove duplicates
  const walletBalances = Object.values(
    balances.reduce((acc, balance) => {
      const pairId = balance.pair._id.toString();
      if (!acc[pairId]) {
        acc[pairId] = {
          pair: {
            _id: balance.pair._id,
            logoUrl: balance.pair.logoUrl,
            name: balance.pair.name,
            baseAsset: balance.pair.baseAsset
          }
        };
      }
      return acc;
    }, {})
  );

  return { wallets: walletBalances };
});
