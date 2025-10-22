import BigNumber from "~/lib/bignumber.config";
import { ORDER_STATUSES } from "~/db/schemas/Order";

const Pair = getModel("Pair")
const Order = getModel("Order")
const Balance = getModel("Balance")

/**
 * Settle order (when order closes)
 * Input: human-readable profit/loss, distributions in smallest units
 * Output: human-readable result
 */
export async function settleOrder(
    baseAsset,
    lockedDistributions, // in smallest units from lockBalanceForOrder
    profitOrLoss, // human-readable
    isProfit
) {
    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw createError({ statusCode: 404, message: `${baseAsset} not found` });
    }

    const profitOrLossSmallest = toSmallestUnit(Math.abs(profitOrLoss), pair.decimals);

    // First, unlock the original locked amounts
    for (const dist of lockedDistributions) {
        const balance = await Balance.findById(dist.balanceId);
        if (!balance) continue;

        balance.locked = subtract(balance.locked, dist.amount);

        if (isProfit) {
            // Add back unlocked + proportional profit
            const totalLocked = lockedDistributions.reduce((sum, d) => add(sum, d.amount), '0');
            const proportion = new BigNumber(dist.amount).dividedBy(totalLocked);
            const profitShare = multiply(profitOrLossSmallest, proportion.toString());

            const totalReturn = add(dist.amount, profitShare);
            balance.available = add(balance.available, totalReturn);
        } else {
            // Calculate proportional loss
            const totalLocked = lockedDistributions.reduce((sum, d) => add(sum, d.amount), '0');
            const proportion = new BigNumber(dist.amount).dividedBy(totalLocked);
            const lossShare = multiply(profitOrLossSmallest, proportion.toString());

            // Add back unlocked minus loss
            const remaining = subtract(dist.amount, lossShare);
            balance.available = add(balance.available, remaining);
        }

        await balance.save();
    }

    return {
        success: true,
        settled: lockedDistributions.length,
        profitOrLoss: toReadableUnit(profitOrLossSmallest, pair.decimals),
        isProfit
    };
}

// ============================================
// ORDER MANAGEMENT FUNCTIONS
// ============================================

/**
 * Place a new order
 * Input: human-readable amounts, Output: human-readable result
 */
export async function placeOrder(
    tradingAccountId,
    pairId,
    orderType,
    amountUsdt, // human-readable
    leverage,
    deliveryTime,
    entryPrice,
    fee // human-readable
) {
    // Lock balance for this order (amount + fee)
    const totalCost = parseFloat(amountUsdt) + parseFloat(fee);

    const locked = await lockBalanceForOrder(
        tradingAccountId,
        "USDT",
        totalCost.toString()
    );

    try {
        // Create order
        const order = await Order.create({
            tradingAccount: tradingAccountId,
            pair: pairId,
            type: orderType,
            amountUsdt: parseFloat(amountUsdt),
            leverage: parseFloat(leverage),
            status: ORDER_STATUSES.OPEN,
            deliveryTime,
            openingPrice: parseFloat(entryPrice),
            maxPrice: parseFloat(entryPrice),
            minPrice: parseFloat(entryPrice),
            openedAt: new Date(),
            pnl: 0,
            fee: parseFloat(fee),
            lockedDistributions: locked.distributions // Stored in smallest units
        });

        return {
            order,
            locked: locked.distributions
        };
    } catch (error) {
        // Rollback on failure
        await unlockBalance("USDT", locked.distributions);
        throw error;
    }
}

/**
 * Cancel an open order
 */
export async function cancelOrder(orderId) {
    const order = await Order.findById(orderId);
    if (!order) {
        throw new Error('Order not found');
    }

    if (order.status !== ORDER_STATUSES.OPEN) {
        throw new Error(`Cannot cancel order with status: ${order.status}`);
    }

    // Unlock the locked balances
    await unlockBalance("USDT", order.lockedDistributions);

    // Update order status
    order.status = ORDER_STATUSES.CANCELLED;
    order.closedAt = new Date();
    await order.save();

    return order;
}

/**
 * Close an order (settlement)
 * @param profitLossAmount - human-readable, positive for profit, negative for loss
 */
export async function closeOrder(orderId, profitLossAmount) {
    const order = await Order.findById(orderId).populate('tradingAccount');
    if (!order) {
        throw new Error('Order not found');
    }

    if (order.status !== ORDER_STATUSES.OPEN) {
        throw new Error(`Cannot close order with status: ${order.status}. Must be open.`);
    }

    const profitLoss = parseFloat(profitLossAmount);
    const isProfit = profitLoss >= 0;

    // Settle the order (unlock + apply profit/loss)
    await settleOrder(
        "USDT",
        order.lockedDistributions,
        Math.abs(profitLoss),
        isProfit
    );

    // Update order
    order.status = ORDER_STATUSES.CLOSED;
    order.pnl = profitLoss;
    order.closedAt = new Date();
    await order.save();

    return {
        order,
        profitLoss,
        isProfit
    };
}

/**
 * Get all orders for a trading account
 */
export async function getOrders(tradingAccountId, filters = {}) {
    const query = { tradingAccount: tradingAccountId, ...filters };

    const orders = await Order.find(query)
        .populate('pair')
        .sort({ createdAt: -1 });

    return orders;
}

/**
 * Get open orders for a trading account
 */
export async function getOpenOrders(tradingAccountId) {
    return getOrders(tradingAccountId, { status: ORDER_STATUSES.OPEN });
}

/**
 * Get order statistics
 */
export async function getOrderStatistics(tradingAccountId) {
    const orders = await Order.find({ tradingAccount: tradingAccountId });

    const stats = {
        total: orders.length,
        pending: 0,
        open: 0,
        closed: 0,
        cancelled: 0,
        totalProfitLoss: 0,
        wins: 0,
        losses: 0,
        winRate: 0
    };

    orders.forEach(order => {
        stats[order.status]++;

        if (order.status === ORDER_STATUSES.CLOSED && order.pnl) {
            const pl = parseFloat(order.pnl);
            stats.totalProfitLoss += pl;

            if (pl > 0) {
                stats.wins++;
            } else if (pl < 0) {
                stats.losses++;
            }
        }
    });

    const totalTrades = stats.wins + stats.losses;
    if (totalTrades > 0) {
        stats.winRate = (stats.wins / totalTrades) * 100;
    }

    return stats;
}

/**
 * Bulk cancel all open orders for a trading account
 */
export async function cancelAllOrders(tradingAccountId) {
    const openOrders = await getOpenOrders(tradingAccountId);

    const cancelled = [];
    const errors = [];

    for (const order of openOrders) {
        try {
            const result = await cancelOrder(order._id);
            cancelled.push(result);
        } catch (error) {
            errors.push({
                orderId: order._id,
                error: error.message
            });
        }
    }

    return {
        cancelled: cancelled.length,
        errors: errors.length,
        details: { cancelled, errors }
    };
}