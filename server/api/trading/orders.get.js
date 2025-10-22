export default defineEventHandler(async (event) => {
    const { accountId, status } = getQuery(event);

    if (!accountId) {
        throw createError({
            statusCode: 400,
            message: 'accountId is required'
        });
    }

    // Verify trading account ownership
    const TradingAccount = getModel('TradingAccount');
    const tradingAccount = await TradingAccount.findOne({
        _id: accountId,
        user: event.context.auth.user._id
    });

    if (!tradingAccount) {
        throw createError({ statusCode: 403, message: 'Unauthorized' });
    }

    // Build filters
    const filters = {};
    if (status) {
        filters.status = status;
    }

    // Use utility function to get orders
    const orders = await getOrders(accountId, filters);

    // Format response
    return {
        orders: orders.map(order => ({
            _id: order._id,
            pair: {
                symbol: order.pair.symbol,
                logoUrl: order.pair.logoUrl
            },
            type: order.type,
            amountUsdt: order.amountUsdt,
            leverage: order.leverage,
            fee: order.fee || 0,
            status: order.status,
            entryPrice: order.openingPrice,
            exitPrice: order.closingPrice || null,
            maxPrice: order.maxPrice || order.openingPrice,
            minPrice: order.minPrice || order.openingPrice,
            pnl: order.pnl || 0,
            deliveryTime: order.deliveryTime,
            openedAt: order.openedAt,
            closedAt: order.closedAt || null
        }))
    };
});