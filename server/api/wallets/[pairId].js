export default defineEventHandler(async (event) => {
    const pairId = getRouterParam(event, 'pairId');
    const { accountId } = getQuery(event);

    if (!accountId) {
        throw createError({
            statusCode: 400,
            statusMessage: 'accountId is required'
        });
    }

    const Pair = getModel('Pair');
    const Wallet = getModel('Wallet');
    const Network = getModel('Network');

    // Get pair with its networks and chain type
    const pair = await Pair.findById(pairId).select('networks chainType').lean();

    if (!pair) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Pair not found'
        });
    }

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

    return { networks };
});