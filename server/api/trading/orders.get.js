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
            status: order.status,
            purchasePrice: order.purchasePrice,
            deliveryPrice: order.deliveryPrice || null,
            deliveryTime: order.deliveryTime || null,
            pnL: order.pnL || 0,
            purchasedAt: order.purchasedAt,
            deliveredAt: order.deliveredAt || null
        }))
    };
});