import { getTotalBalanceForPair } from "../../utils/user-balances";

export default defineEventHandler(async (event) => {
    const { pairId } = getRouterParams(event);
    const { accountId } = getQuery(event, query => {
        validateInput(query, {
            include: ['accountId']
        })

        return query;
    });


    const Pair = getModel('Pair');

    // Get pair with its networks and chain type
    const pair = await Pair.findById(pairId).lean();

    if (!pair) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Pair not found'
        });
    }

    const { totals } = await getTotalBalanceForPair(accountId, pair.baseAsset)

    const Wallet = getModel('Wallet');

    // Get the appropriate wallet for this pair's chain type
    const wallet = await Wallet.findOne({
        tradingAccount: accountId,
        chainType: pair.chainType
    })
        .select('address')
        .lean();

    if (!wallet) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Wallet not found for this chain type'
        });
    }

    const Network = getModel('Network');

    // Get network info for each network
    const networkDocs = await Network.find({
        id: { $in: pair.networks }
    })
        .select('id logoUrl')
        .lean();

    const networkMap = Object.fromEntries(
        networkDocs.map(n => [n.id, n.logoUrl])
    );

    // Map networks with their addresses and logos
    const networks = pair.networks.map((network) => ({
        network,
        address: wallet.address,
        logoUrl: networkMap[network] || null
    }));


    return {
        ...totals,
        balanceUsd:(parseFloat(totals.available) * pair.valueUsd).toFixed(2),
        pair: {
            _id: pair._id,
            name: pair.name,
            baseAsset: pair.baseAsset,
            symbol: pair.symbol,
            logoUrl: pair.logoUrl
        },
        networks
    };
});