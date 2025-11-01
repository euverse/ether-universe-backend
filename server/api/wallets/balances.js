export default defineEventHandler(async (event) => {
  const { accountId, includeZeroBalances = true } = getQuery(event);
  const tradingAccountId = accountId;

  if (!tradingAccountId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'accountId is required'
    });
  }

  const TradingAccount = getModel('TradingAccount');

  // Verify account exists
  const tradingAccount = await TradingAccount.findById(tradingAccountId)
    .select('type')
    .lean();

  if (!tradingAccount) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Trading account not found'
    });
  }

  const accountBalances = await getBalancesByPair(tradingAccount._id, {
    includeZeroBalances
  });

  // Transform to match spec format
  const balances = Object.values(accountBalances).map(balance => ({
    pair: {
      _id: balance.pair._id,
      symbol: balance.pair.symbol,
      name: balance.pair.name,
      logoUrl: balance.pair.logoUrl,
      valueUsd: balance.pair.valueUsd.toString(),
      baseAsset: balance.pair.baseAsset
    },
    decimals: balance.pair.decimals,
    available: balance.totals.available,
    balanceUsd: (parseFloat(balance.totals.available) * balance.pair.valueUsd).toFixed(2),
    locked: balance.totals.locked
  }));

  const totalBalanceUsd = parseFloat(balances.map(b => parseFloat(b.balanceUsd)).reduce((acc, balance) => acc + balance, 0)).toFixed(2);

  return {
    balances,
    totalBalanceUsd
  };
});