import { ORDER_STATUSES } from "~/db/schemas/Order";

const Pair = getModel("Pair")
const Order = getModel("Order")
const Balance = getModel("Balance")

/**
 * Get total USDT available across both allocations and balances
 * Returns combined human-readable amounts
 */
export async function getTradingAccountUSDTBalance(tradingAccountId) {
    const baseAsset = 'USDT';

    // Get allocation stats - pass null for userId since we have tradingAccountId
    const allocationStats = await getAllocationForPair(
        { tradingAccountId, userId: null },
        baseAsset
    );

    // Get balance stats
    const balanceStats = await getTotalBalanceForPair(tradingAccountId, baseAsset);

    // Combine available amounts
    const pair = allocationStats.pair;
    const decimals = pair.decimals;

    const allocationAvailable = toSmallestUnit(allocationStats.totals.available, decimals);
    const balanceAvailable = toSmallestUnit(balanceStats.totals.available, decimals);
    const totalAvailable = add(allocationAvailable, balanceAvailable);

    const allocationLocked = toSmallestUnit(allocationStats.totals.locked, decimals);
    const balanceLocked = toSmallestUnit(balanceStats.totals.locked, decimals);
    const totalLocked = add(allocationLocked, balanceLocked);

    const grandTotal = add(totalAvailable, totalLocked);

    return {
        pair,
        totals: {
            available: toReadableUnit(totalAvailable, decimals),
            locked: toReadableUnit(totalLocked, decimals),
            total: toReadableUnit(grandTotal, decimals)
        },
        breakdown: {
            allocations: allocationStats.totals,
            balances: balanceStats.totals
        }
    };
}

/**
 * Lock USDT - tries allocations first, then balances
 * Returns combined distributions for later unlocking
 */
export async function lockUSDT({ tradingAccountId, userId }, amount, preferredNetwork = null) {
    validatePositiveAmount(amount, 'amount');
    const baseAsset = 'USDT';

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw new Error(`Pair ${baseAsset} not found`);
    }
    validateDecimals(pair.decimals);

    const amountSmallest = toSmallestUnit(amount, pair.decimals);
    let remaining = amountSmallest;

    const allocationDistributions = [];
    const balanceDistributions = [];

    // PHASE 1: Try to lock from allocations first
    try {
        const allocationStats = await getAllocationForPair(
            { tradingAccountId, userId },
            baseAsset
        );

        const allocationAvailable = toSmallestUnit(allocationStats.totals.available, pair.decimals);

        if (compare(allocationAvailable, '0') > 0) {
            const toLockFromAllocations = min(remaining, allocationAvailable);
            const allocationResult = await lockAllocations(
                { tradingAccountId, userId },
                baseAsset,
                toReadableUnit(toLockFromAllocations, pair.decimals)
            );
            allocationDistributions.push(...allocationResult.distributions);
            remaining = subtract(remaining, toLockFromAllocations);
        }
    } catch (error) {
        // No allocations available, continue to balances
    }

    // PHASE 2: Lock remaining from balances if needed
    if (compare(remaining, '0') > 0) {
        const resolvedAccountId = await resolveTradingAccount({ tradingAccountId, userId });
        const balanceResult = await lockAssetBalances(
            resolvedAccountId,
            baseAsset,
            toReadableUnit(remaining, pair.decimals),
            preferredNetwork
        );
        balanceDistributions.push(...balanceResult.distributions);
        remaining = '0';
    }

    return {
        totalLocked: toReadableUnit(amountSmallest, pair.decimals),
        distributions: {
            allocations: allocationDistributions,
            balances: balanceDistributions
        }
    };
}

/**
 * Unlock USDT - accepts allocation distributions, balance distributions, or both
 * @param {Object} params
 * @param {Array} params.allocations - Optional allocation distributions
 * @param {Array} params.balances - Optional balance distributions
 */
export async function unlockUSDT({ allocations, balances }) {
    const baseAsset = 'USDT';

    if (!allocations && !balances) {
        throw new Error('No distributions provided for unlock');
    }

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw new Error(`Pair ${baseAsset} not found`);
    }
    validateDecimals(pair.decimals);

    let totalUnlocked = '0';
    const results = {
        allocations: null,
        balances: null
    };

    // Unlock allocations if provided
    if (allocations && allocations.length > 0) {
        const allocationResult = await unlockAllocations(baseAsset, allocations);
        results.allocations = allocationResult;
        totalUnlocked = add(
            totalUnlocked,
            toSmallestUnit(allocationResult.totalUnlocked, pair.decimals)
        );
    }

    // Unlock balances if provided
    if (balances && balances.length > 0) {
        const balanceResult = await unlockBalance(baseAsset, balances);
        results.balances = balanceResult;
        totalUnlocked = add(
            totalUnlocked,
            toSmallestUnit(balanceResult.totalUnlocked, pair.decimals)
        );
    }

    return {
        totalUnlocked: toReadableUnit(totalUnlocked, pair.decimals),
        breakdown: results
    };
}

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
    const pnLSmallest = toSmallestUnit(Math.abs(profitOrLoss), pair.decimals);

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
            const pnLShare = multiply(pnLSmallest, proportion);


            if (isProfit) {
                balance.available = add(balance.available, pnLShare);
                balance.totalPnL = add(balance.totalPnL, pnLShare);
            } else {
                balance.available = subtract(balance.available, pnLShare);
                balance.totalPnL = subtract(balance.totalPnL, pnLShare);
            }

            balance.lastSettledAt = new Date();
            await balance.save();

            totalDistributed = add(totalDistributed, pnLShare);

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
    tradingAccountId,
    baseAsset,
    lockedBalanceDistributions,
    lockedAllocationDistributions,
    profitOrLoss, // human-readable
    isProfit
) {
    // Step 1: Unlock original amounts
    const unlockResult = await unlockUSDT({
        allocations: lockedAllocationDistributions,
        balances: lockedBalanceDistributions
    });

    // Step 2: Distribute PnL if any
    let pnLResult = null;
    if (profitOrLoss !== 0) {
        // If we have balance distributions, use proportional distribution
        if (lockedBalanceDistributions && lockedBalanceDistributions.length > 0) {
            pnLResult = await distributePnL(
                baseAsset,
                lockedBalanceDistributions,
                profitOrLoss,
                isProfit
            );
        } else {
            // No balance distributions (only allocations), add PnL to any balance
            pnLResult = await addPnL(
                tradingAccountId,
                baseAsset,
                isProfit ? profitOrLoss : `-${profitOrLoss}`
            );
        }
    }

    return {
        totalUnlocked: unlockResult.totalUnlocked,
        totalPnL: pnLResult?.totalDistributed || pnLResult?.amount || '0',
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
    // Lock balance for this order (amount + fee) - prioritizes allocations first
    const totalCost = parseFloat(amountUsdt) + parseFloat(fee);
    const locked = await lockUSDT(
        { tradingAccountId },
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
            pnL: 0,
            fee: parseFloat(fee),
            lockedBalanceDistributions: locked.distributions.balances, // Stored in smallest units
            lockedAllocationDistributions: locked.distributions.allocations // Stored in smallest units
        });

        return {
            order,
            locked: locked.distributions
        };
    } catch (error) {
        // Rollback on failure
        await unlockUSDT(locked.distributions);
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

    // Unlock the locked balances and allocations
    await unlockUSDT({
        allocations: order.lockedAllocationDistributions,
        balances: order.lockedBalanceDistributions
    });

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
        order.tradingAccount._id || order.tradingAccount,
        "USDT",
        order.lockedBalanceDistributions,
        order.lockedAllocationDistributions,
        Math.abs(profitLoss),
        isProfit
    );

    // Update order
    order.status = ORDER_STATUSES.CLOSED;
    order.pnL = profitLoss;
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

        if (order.status === ORDER_STATUSES.CLOSED && order.pnL) {
            const pnL = parseFloat(order.pnL);
            stats.totalProfitLoss += pnL;

            if (pnL > 0) {
                stats.wins++;
            } else if (pnL < 0) {
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