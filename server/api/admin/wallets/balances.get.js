export default defineEventHandler(async (event) => {
    const { includeZeroBalances = true } = getQuery(event);


    const adminBalances = await getAdminBalancesByPair({
        includeZeroBalances
    });

    // Transform to match spec format
    const balances = Object.values(adminBalances).map(balance => ({
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
        locked: balance.totals.locked,
        total: balance.totals.total
    }));

    // Calculate total balance correctly
    const totalBalanceUsd = balances
        .reduce((acc, curr) => {
            return acc + parseFloat(curr.balanceUsd);
        }, 0)
        .toFixed(2);

    return {
        balances,
        totalBalanceUsd
    };
});