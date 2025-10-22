import { ORDER_STATUSES } from "~/db/schemas/Order";

export default defineEventHandler(async (event) => {
    const { accountId, startDate, endDate, interval = '1d' } = getQuery(event);

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

    // Build date filter
    const ordersFilter = { status: ORDER_STATUSES.CLOSED };

    if (startDate) {
        ordersFilter.closedAt = { $gte: new Date(startDate) };
    }

    if (endDate) {
        if (!ordersFilter.closedAt) ordersFilter.closedAt = {};
        ordersFilter.closedAt.$lte = new Date(endDate);
    }

    // Get closed orders
    const Order = getModel('Order');
    const orders = await Order.find({
        tradingAccount: accountId,
        ...ordersFilter
    })
        .select('pnl closedAt')
        .sort({ closedAt: 1 })
        .lean();

    console.log(orders)

    // Generate statistics
    const statistics = generateProfitStatistics(orders, interval, startDate, endDate);

    // Calculate totals
    const totalPnl = orders.reduce((sum, o) => sum + (o.pnl || 0), 0);
    const winningTrades = orders.filter(o => (o.pnl || 0) > 0).length;
    const losingTrades = orders.filter(o => (o.pnl || 0) < 0).length;

    return {
        accountId,
        statistics,
        summary: {
            totalPnl: parseFloat(totalPnl.toFixed(2)),
            totalTrades: orders.length,
            profitableTrades: winningTrades,
            losingTrades,
            winRate: orders.length > 0
                ? parseFloat(((winningTrades / orders.length) * 100).toFixed(2))
                : 0
        },
        period: {
            startDate: startDate || (orders.length > 0 ? orders[0].closedAt : null),
            endDate: endDate || new Date().toISOString()
        }
    };
});

/**
 * Generate cumulative profit statistics for charting
 */
function generateProfitStatistics(orders, interval, startDate, endDate) {
    if (orders.length === 0) {
        return [[Math.floor(Date.now() / 1000), 0]];
    }

    const statistics = [];
    let cumulativePnl = 0;

    const start = startDate ? new Date(startDate) : new Date(orders[0].closedAt);
    const end = endDate ? new Date(endDate) : new Date();

    const intervalMs = getIntervalMs(interval);
    const current = new Date(start);
    const groupedData = {};

    // Initialize time buckets
    while (current <= end) {
        const timestamp = Math.floor(current.getTime() / 1000);
        groupedData[timestamp] = 0;
        current.setTime(current.getTime() + intervalMs);
    }

    // Group orders into time buckets
    orders.forEach(order => {
        if (!order.closedAt) return;

        const orderTime = new Date(order.closedAt).getTime();
        const bucketTime = Math.floor(orderTime / intervalMs) * intervalMs;
        const timestamp = Math.floor(bucketTime / 1000);

        if (groupedData[timestamp] !== undefined) {
            groupedData[timestamp] += order.pnl || 0;
        }
    });

    // Build cumulative statistics array
    Object.keys(groupedData)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .forEach(timestamp => {
            cumulativePnl += groupedData[timestamp];
            statistics.push([
                parseInt(timestamp),
                parseFloat(cumulativePnl.toFixed(2))
            ]);
        });

    return statistics;
}

/**
 * Convert interval string to milliseconds
 */
function getIntervalMs(interval) {
    const intervalMap = {
        '1m': 60 * 1000,
        '5m': 5 * 60 * 1000,
        '15m': 15 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '4h': 4 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '1w': 7 * 24 * 60 * 60 * 1000
    };

    return intervalMap[interval] || intervalMap['1d'];
}