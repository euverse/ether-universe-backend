/**
 * Get combined totals for all pairs (balances + allocations)
 * Returns human-readable amounts grouped by pair
 */
export async function getAggregateTotalByPair(tradingAccountId, { includeZeroBalances = true } = {}) {
    // Get both balances and allocations grouped by pair
    const balancesByPair = await getBalancesByPair(tradingAccountId, { includeZeroBalances });
    const allocationsByPair = await getAllocationsByPair({ tradingAccountId });

    const combined = {};

    // Start with balances
    for (const [pairSymbol, balanceData] of Object.entries(balancesByPair)) {
        combined[pairSymbol] = {
            pair: balanceData.pair,
            totals: {
                available: balanceData.totals.available,
                locked: balanceData.totals.locked,
                total: balanceData.totals.total,
                initial: balanceData.totals.initial,
                totalDeposited: balanceData.totals.totalDeposited,
                totalAllocated: balanceData.totals.totalAllocated,
                totalWithdrawn: balanceData.totals.totalWithdrawn
            },
            networks: balanceData.networks,
            breakdown: {
                balances: balanceData.totals,
                allocations: {
                    available: '0',
                    locked: '0',
                    total: '0'
                }
            }
        };
    }

    // Add allocations
    for (const [pairSymbol, allocationData] of Object.entries(allocationsByPair)) {
        const decimals = allocationData.pair.decimals;

        if (!combined[pairSymbol]) {
            // Pair exists in allocations but not in balances
            combined[pairSymbol] = {
                pair: allocationData.pair,
                totals: {
                    available: allocationData.totals.available,
                    locked: allocationData.totals.locked,
                    total: allocationData.totals.total,
                    initial: '0',
                    totalDeposited: '0',
                    totalAllocated: '0',
                    totalWithdrawn: '0'
                },
                networks: {},
                breakdown: {
                    balances: {
                        available: '0',
                        locked: '0',
                        total: '0',
                        initial: '0',
                        totalDeposited: '0',
                        totalAllocated: '0',
                        totalWithdrawn: '0'
                    },
                    allocations: allocationData.totals
                }
            };
        } else {
            // Combine with existing balance data
            const balanceAvailable = toSmallestUnit(combined[pairSymbol].totals.available, decimals);
            const balanceLocked = toSmallestUnit(combined[pairSymbol].totals.locked, decimals);
            const balanceTotal = toSmallestUnit(combined[pairSymbol].totals.total, decimals);

            const allocationAvailable = toSmallestUnit(allocationData.totals.available, decimals);
            const allocationLocked = toSmallestUnit(allocationData.totals.locked, decimals);
            const allocationTotal = toSmallestUnit(allocationData.totals.total, decimals);

            const totalAvailable = add(balanceAvailable, allocationAvailable);
            const totalLocked = add(balanceLocked, allocationLocked);
            const grandTotal = add(balanceTotal, allocationTotal);

            combined[pairSymbol].totals.available = toReadableUnit(totalAvailable, decimals);
            combined[pairSymbol].totals.locked = toReadableUnit(totalLocked, decimals);
            combined[pairSymbol].totals.total = toReadableUnit(grandTotal, decimals);
            combined[pairSymbol].breakdown.allocations = allocationData.totals;
        }
    }

    return combined;
}

/**
 * Get combined total for a specific pair (balances + allocations)
 * Returns human-readable amounts
 */
export async function getAggregateTotalForPair(tradingAccountId, baseAsset) {
    // Get allocation stats
    const allocationStats = await getAllocationForPair(
        { tradingAccountId, userId: null },
        baseAsset
    );

    // Get balance stats
    const balanceStats = await getTotalBalanceForPair(tradingAccountId, baseAsset);

    // Combine amounts
    const pair = allocationStats.pair;
    const decimals = pair.decimals;

    // Convert to smallest units for addition
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
            total: toReadableUnit(grandTotal, decimals),
            initial: balanceStats.totals.initial,
            totalDeposited: balanceStats.totals.totalDeposited,
            totalAllocated: balanceStats.totals.totalAllocated,
            totalWithdrawn: balanceStats.totals.totalWithdrawn
        },
        byNetwork: balanceStats.byNetwork,
        breakdown: {
            allocations: allocationStats.totals,
            balances: balanceStats.totals
        },
        smallestUnits: {
            available: totalAvailable,
            locked: totalLocked,
            total: grandTotal
        }
    };
}

/**
 * Remove withdrawal from aggregate total (allocations + balances)
 * Prioritizes allocations first (FIFO by expiry), then balances
 * Input: human-readable amount, Output: human-readable result
 */
export async function removeUserWithdrawalFromAggregateTotal(
    tradingAccountId,
    baseAsset,
    amount, // human-readable
    options = {}
) {
    const {
        sourceNetwork = null,
        prioritizeBalances = false // if true, withdraw from balances first
    } = options;

    const Pair = getModel("Pair")

    const pair = await Pair.findOne({ baseAsset });

    if (!pair) {
        throw Error(`Pair ${baseAsset} not found`);
    }

    validateDecimals(pair.decimals);
    validatePositiveAmount(amount, 'amount');

    // Get available amounts from both sources
    const allocationStats = await getAllocationForPair(
        { tradingAccountId, userId: null },
        baseAsset
    );
    const balanceStats = await getTotalBalanceForPair(tradingAccountId, baseAsset);

    const allocationAvailable = allocationStats.totals.available;
    const balanceAvailable = balanceStats.totals.available;

    // Calculate total available
    const totalAvailableSmallest = add(
        toSmallestUnit(allocationAvailable, pair.decimals),
        toSmallestUnit(balanceAvailable, pair.decimals)
    );
    const amountSmallest = toSmallestUnit(amount, pair.decimals);

    if (!isGreaterOrEqual(totalAvailableSmallest, amountSmallest)) {
        throw new Error(
            `Insufficient total available. Available: ${toReadableUnit(totalAvailableSmallest, pair.decimals)}, Required: ${amount}`
        );
    }

    let remainingSmallest = amountSmallest;
    const result = {
        totalAmount: amount,
        fromAllocations: null,
        fromBalances: null,
        summary: {
            allocationsUsed: '0',
            balancesUsed: '0'
        }
    };

    // Determine order of withdrawal
    const withdrawalOrder = prioritizeBalances
        ? [
            { type: 'balances', available: balanceAvailable },
            { type: 'allocations', available: allocationAvailable }
        ]
        : [
            { type: 'allocations', available: allocationAvailable },
            { type: 'balances', available: balanceAvailable }
        ];

    for (const source of withdrawalOrder) {
        if (compare(remainingSmallest, '0') <= 0) break;

        const availableSmallest = toSmallestUnit(source.available, pair.decimals);
        if (compare(availableSmallest, '0') <= 0) continue; // Skip if nothing available

        // Determine how much to withdraw from this source
        const toWithdraw = min(availableSmallest, remainingSmallest);
        const toWithdrawReadable = toReadableUnit(toWithdraw, pair.decimals);

        if (source.type === 'allocations') {
            result.fromAllocations = await deductFromAllocations(
                tradingAccountId,
                baseAsset,
                toWithdrawReadable
            );
            result.summary.allocationsUsed = toWithdrawReadable;
        } else {
            result.fromBalances = await removeUserWithdrawalFromBalances(
                tradingAccountId,
                baseAsset,
                toWithdrawReadable,
                sourceNetwork
            );
            result.summary.balancesUsed = toWithdrawReadable;
        }

        remainingSmallest = subtract(remainingSmallest, toWithdraw);
    }

    // Final check (should never happen due to initial validation)
    if (compare(remainingSmallest, '0') > 0) {
        throw new Error(
            `Unable to fulfill withdrawal. Required: ${amount}, Missing: ${toReadableUnit(remainingSmallest, pair.decimals)}`
        );
    }

    return result;
}