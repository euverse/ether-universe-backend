import { ORDER_STATUSES } from "~/db/schemas/Order";

const Pair = getModel("Pair")
const Order = getModel("Order")
const Balance = getModel("Balance")

/**
 * Distribute PnL across balances proportionally
 * Input: distributions in smallest units, human-readable PnL
 */
export async function distributePnL(
    baseAsset,
    distributions, // Same distributions from lock
    profitOrLoss, // human-readable
    isProfit
) {

    if (isZero(Math.abs(profitOrLoss))) {
        throw Error('profitOrLoss must not be zero')
    }

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw Error(`Pair ${baseAsset} not found`);
    }

    validateDecimals(pair.decimals);
    const pnlSmallest = toSmallestUnit(Math.abs(profitOrLoss), pair.decimals);

    // Calculate total locked for proportional distribution
    const totalLocked = distributions.reduce((sum, d) => add(sum, d.amount), '0');

    const errors = [];
    let totalDistributed = '0';

    for (const dist of distributions) {
        try {
            const balance = await Balance.findById(dist.balanceId);
            if (!balance) {
                errors.push(`Balance ${dist.balanceId} not found`);
                continue;
            }

            // Calculate proportional share - multiply already handles rounding
            const proportion = calculateProportion(dist.amount, totalLocked);
            const pnlShare = multiply(pnlSmallest, proportion);


            if (isProfit) {
                balance.available = add(balance.available, pnlShare);
                balance.totalPnL = add(balance.totalPnL, pnlShare);
            } else {
                balance.available = subtract(balance.available, pnlShare);
                balance.totalPnL = subtract(balance.totalPnL, pnlShare);
            }

            balance.lastSettledAt = new Date();
            await balance.save();

            totalDistributed = add(totalDistributed, pnlShare);

        } catch (error) {
            errors.push(`Failed to distribute PnL to balance ${dist.balanceId}: ${error.message}`);
        }
    }

    if (errors.length > 0) {
        throw new Error(`PnL distribution completed with errors: ${errors.join('; ')}`);
    }

    return {
        totalDistributed: toReadableUnit(totalDistributed, pair.decimals),
        isProfit
    };
}

/**
 * Settle order (when order closes)
 * Unlocks funds and distributes PnL
 */
export async function settleOrder(
    baseAsset,
    lockedDistributions,
    profitOrLoss, // human-readable
    isProfit
) {
    // Step 1: Unlock original amounts
    const unlockResult = await unlockBalance(baseAsset, lockedDistributions);

    // Step 2: Distribute PnL if any
    let pnlResult = null;
    if (profitOrLoss !== 0) {
        pnlResult = await distributePnL(baseAsset, lockedDistributions, profitOrLoss, isProfit);
    }

    return {
        totalUnlocked: unlockResult.totalUnlocked,
        totalPnL: pnlResult?.totalDistributed || '0',
        isProfit
    };
}

// ORDER MANAGEMENT FUNCTIONS

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

    const locked = await lockAssetBalances(
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

    if (order.status !== ORDER_STATUSES.PENDING) {
        throw new Error(`Cannot cancel order with status: ${order.status}`);
    }

    // Unlock the locked balances
    await unlockBalance("USDT", order.lockedDistributions);

    // Update order status
    order.status = ORDER_STATUSES.CANCELLED;
    order.cancelledAt = new Date();
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
export async function getPendingOrders(tradingAccountId) {
    return getOrders(tradingAccountId, { status: ORDER_STATUSES.PENDING });
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
            const pnl = parseFloat(order.pnl);
            stats.totalProfitLoss += pnl;

            if (pnl > 0) {
                stats.wins++;
            } else if (pnl < 0) {
                stats.losses++;
            }
        }
    });

    const totalViableTrades = stats.wins + stats.losses;
    if (totalViableTrades > 0) {
        stats.winRate = (stats.wins / totalViableTrades) * 100;
    }

    return stats;
}

/**
 * Bulk cancel all open orders for a trading account
 */
export async function cancelAllOrders(tradingAccountId) {
    const pendingOrders = await getPendingOrders(tradingAccountId);

    const cancelled = [];
    const errors = [];

    for (const order of pendingOrders) {
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