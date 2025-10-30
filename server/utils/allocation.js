import { ACCOUNT_TYPES } from '~/db/schemas/TradingAccount';

const Pair = getModel('Pair');
const TradingAccount = getModel('TradingAccount');
const AssetAllocation = getModel('AssetAllocation');

// ALLOCATION FORMATTING UTILITIES

/**
 * Format grouped allocations to human-readable
 */
function formatGroupedAllocations(grouped) {
    const formatted = {};

    for (const [pairSymbol, data] of Object.entries(grouped)) {
        validateDecimals(data.pair.decimals);
        const decimals = data.pair.decimals;

        formatted[pairSymbol] = {
            pair: data.pair,
            totals: {
                available: toReadableUnit(data.totals.available, decimals),
                locked: toReadableUnit(data.totals.locked, decimals),
                total: toReadableUnit(data.totals.total, decimals)
            },
            allocations: data.allocations.map(alloc => ({
                _id: alloc._id,
                available: toReadableUnit(alloc.available, decimals),
                locked: toReadableUnit(alloc.locked, decimals),
                total: toReadableUnit(alloc.total, decimals),
                expiresAt: alloc.expiresAt,
                timeRemaining: alloc.timeRemaining,
                createdAt: alloc.createdAt
            }))
        };
    }

    return formatted;
}

// ALLOCATION CREATION

/**
 * Create a new asset allocation for a trading account
 * Input: human-readable amount
 * Output: human-readable result
 */
export async function createAllocation(userId, baseAsset, amount) {
    validatePositiveAmount(amount, 'amount');

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw new Error(`Pair ${baseAsset} not found`);
    }

    if (!pair.isActive) {
        throw new Error(`Pair ${baseAsset} is not active`);
    }

    validateDecimals(pair.decimals);

    const userRealAccount = await TradingAccount.findOne({
        user: userId,
        type: ACCOUNT_TYPES.REAL
    });

    if (!userRealAccount) {
        throw new Error('User has no real trading account');
    }

    const amountSmallest = toSmallestUnit(amount, pair.decimals);

    const allocation = await AssetAllocation.create({
        user: userId,
        tradingAccount: userRealAccount._id,
        pair: pair._id,
        available: amountSmallest,
        locked: '0',
        total: amountSmallest
    });

    return {
        allocationId: allocation._id,
        amount: toReadableUnit(amountSmallest, pair.decimals),
        expiresAt: allocation.expiresAt,
        timeRemaining: allocation.timeRemaining
    };
}

// HELPER FUNCTION

/**
 * Resolve trading account from either tradingAccountId or userId
 */
export async function resolveTradingAccount({ tradingAccountId, userId }) {
    if (!tradingAccountId && !userId) {
        throw new Error('Either tradingAccountId or userId must be provided');
    }

    if (tradingAccountId) {
        const account = await TradingAccount.findById(tradingAccountId);
        if (!account) {
            throw new Error('Trading account not found');
        }
        return account._id;
    }

    // Resolve from userId (use REAL account)
    const account = await TradingAccount.findOne({
        user: userId,
        type: ACCOUNT_TYPES.REAL
    });

    if (!account) {
        throw new Error('User has no real trading account');
    }

    return account._id;
}

// ALLOCATION QUERY FUNCTIONS

/**
 * Get allocation stats for a specific pair in a trading account
 * Returns human-readable amounts
 */
export async function getAllocationForPair({ tradingAccountId, userId }, baseAsset) {
    const resolvedAccountId = await resolveTradingAccount({ tradingAccountId, userId });

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw new Error(`Pair ${baseAsset} not found`);
    }

    validateDecimals(pair.decimals);

    const allocations = await AssetAllocation.find({
        tradingAccount: resolvedAccountId,
        pair: pair._id
    }).sort({ expiresAt: 1 }); // Sort by expiry (oldest first)

    if (allocations.length === 0) {
        return {
            pair,
            totals: {
                available: '0',
                locked: '0',
                total: '0'
            },
            allocations: []
        };
    }

    // Calculate totals in smallest units
    let totalAvailable = '0';
    let totalLocked = '0';
    let totalAmount = '0';

    const allocationDetails = [];

    for (const allocation of allocations) {
        totalAvailable = add(totalAvailable, allocation.available);
        totalLocked = add(totalLocked, allocation.locked);
        totalAmount = add(totalAmount, allocation.total);

        allocationDetails.push({
            _id: allocation._id,
            available: allocation.available,
            locked: allocation.locked,
            total: allocation.total,
            expiresAt: allocation.expiresAt,
            timeRemaining: allocation.timeRemaining,
            createdAt: allocation.createdAt
        });
    }

    const decimals = pair.decimals;

    return {
        pair,
        totals: {
            available: toReadableUnit(totalAvailable, decimals),
            locked: toReadableUnit(totalLocked, decimals),
            total: toReadableUnit(totalAmount, decimals)
        },
        allocations: allocationDetails.map(alloc => ({
            _id: alloc._id,
            available: toReadableUnit(alloc.available, decimals),
            locked: toReadableUnit(alloc.locked, decimals),
            total: toReadableUnit(alloc.total, decimals),
            expiresAt: alloc.expiresAt,
            timeRemaining: alloc.timeRemaining,
            createdAt: alloc.createdAt
        }))
    };
}

/**
 * Get all allocations for a trading account grouped by pair
 * Returns human-readable amounts
 */
export async function getAllocationsByPair({ tradingAccountId, userId } = {}) {
    const resolvedAccountId = await resolveTradingAccount({ tradingAccountId, userId });

    const allocations = await AssetAllocation.find({
        tradingAccount: resolvedAccountId
    })
        .populate('pair')
        .sort({ expiresAt: 1 });

    if (allocations.length === 0) {
        return {};
    }

    // Group by pair (in smallest units)
    const grouped = {};

    for (const allocation of allocations) {
        if (!allocation.pair) {
            throw new Error(`Allocation ${allocation._id} is missing pair reference`);
        }

        const pairSymbol = allocation.pair.symbol;

        if (!grouped[pairSymbol]) {
            grouped[pairSymbol] = {
                pair: allocation.pair,
                totals: {
                    available: '0',
                    locked: '0',
                    total: '0'
                },
                allocations: []
            };
        }

        grouped[pairSymbol].totals.available = add(
            grouped[pairSymbol].totals.available,
            allocation.available
        );
        grouped[pairSymbol].totals.locked = add(
            grouped[pairSymbol].totals.locked,
            allocation.locked
        );
        grouped[pairSymbol].totals.total = add(
            grouped[pairSymbol].totals.total,
            allocation.total
        );

        grouped[pairSymbol].allocations.push({
            _id: allocation._id,
            available: allocation.available,
            locked: allocation.locked,
            total: allocation.total,
            expiresAt: allocation.expiresAt,
            timeRemaining: allocation.timeRemaining,
            createdAt: allocation.createdAt
        });
    }

    return formatGroupedAllocations(grouped);
}

// ALLOCATION LOCKING/UNLOCKING FUNCTIONS

/**
 * Lock allocations for a trading account and pair
 * Prioritizes allocations closest to expiry
 * Input: human-readable amount
 * Output: distributions in smallest units (for unlocking)
 */
export async function lockAllocations({ tradingAccountId, userId }, baseAsset, amount) {
    validatePositiveAmount(amount, 'amount');

    const resolvedAccountId = await resolveTradingAccount({ tradingAccountId, userId });

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw new Error(`Pair ${baseAsset} not found`);
    }

    validateDecimals(pair.decimals);
    const amountSmallest = toSmallestUnit(amount, pair.decimals);

    // Get allocations sorted by expiry (oldest first)
    const allocations = await AssetAllocation.find({
        tradingAccount: resolvedAccountId,
        pair: pair._id
    }).sort({ expiresAt: 1 });

    if (allocations.length === 0) {
        throw new Error(`No allocations found for pair: ${baseAsset}`);
    }

    // PHASE 1: Calculate distribution WITHOUT modifying anything
    let remaining = amountSmallest;
    const plannedLocks = [];

    for (const allocation of allocations) {
        if (compare(remaining, '0') <= 0) break;
        if (compare(allocation.available, '0') <= 0) continue;

        const toLock = min(allocation.available, remaining);

        plannedLocks.push({
            allocationId: allocation._id,
            amount: toLock,
            expiresAt: allocation.expiresAt
        });

        remaining = subtract(remaining, toLock);
    }

    // PHASE 2: Verify we have enough BEFORE making any changes
    if (compare(remaining, '0') > 0) {
        throw new Error(
            `Insufficient available allocation. Required: ${amount}, Missing: ${toReadableUnit(remaining, pair.decimals)}`
        );
    }

    // PHASE 3: Now apply all locks (we know we have enough)
    for (const planned of plannedLocks) {
        const allocation = await AssetAllocation.findById(planned.allocationId);
        if (!allocation) {
            throw new Error(`Allocation ${planned.allocationId} not found`);
        }

        allocation.available = subtract(allocation.available, planned.amount);
        allocation.locked = add(allocation.locked, planned.amount);
        await allocation.save();
    }

    return {
        totalLocked: toReadableUnit(amountSmallest, pair.decimals),
        distributions: plannedLocks // Keep in smallest units for unlocking
    };
}

/**
 * Unlock allocations for a trading account and pair
 * Input: distributions in smallest units from lockAllocations
 * Output: human-readable result
 */
export async function unlockAllocations(baseAsset, distributions) {
    if (!distributions || distributions.length === 0) {
        throw new Error('No distributions provided for unlock');
    }

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw new Error(`Pair ${baseAsset} not found`);
    }

    validateDecimals(pair.decimals);

    const errors = [];
    let totalUnlocked = '0';

    for (const dist of distributions) {
        try {
            const allocation = await AssetAllocation.findById(dist.allocationId);
            if (!allocation) {
                errors.push(
                    `Allocation ${dist.allocationId} not found - may have expired`
                );
                continue;
            }

            // Verify sufficient locked amount
            if (!isGreaterOrEqual(allocation.locked, dist.amount)) {
                errors.push(
                    `Insufficient locked amount in allocation ${dist.allocationId}. ` +
                    `Locked: ${allocation.locked}, Attempting to unlock: ${dist.amount}`
                );
                continue;
            }

            allocation.locked = subtract(allocation.locked, dist.amount);
            allocation.available = add(allocation.available, dist.amount);
            await allocation.save();

            totalUnlocked = add(totalUnlocked, dist.amount);
        } catch (error) {
            errors.push(
                `Failed to unlock allocation ${dist.allocationId}: ${error.message}`
            );
        }
    }

    if (errors.length > 0) {
        throw new Error(`Unlock completed with errors: ${errors.join('; ')}`);
    }

    return {
        totalUnlocked: toReadableUnit(totalUnlocked, pair.decimals)
    };
}

// USER-SPECIFIC FUNCTIONS

/**
 * Get allocation history for a user
 * Returns human-readable amounts
 */
export async function getUserAllocations(userId, limit = 10) {
    const allocations = await AssetAllocation.find({
        user: userId
    })
        .populate('pair')
        .sort({ createdAt: -1 })
        .limit(limit);

    return allocations.map(allocation => {
        const decimals = allocation.pair.decimals;
        return {
            _id: allocation._id,
            pair: allocation.pair,
            available: toReadableUnit(allocation.available, decimals),
            locked: toReadableUnit(allocation.locked, decimals),
            total: toReadableUnit(allocation.total, decimals),
            expiresAt: allocation.expiresAt,
            timeRemaining: allocation.timeRemaining,
            createdAt: allocation.createdAt
        };
    });
}

export async function hasActiveAllocations({ userId, tradingAccountId } = {}) {
    if (!tradingAccountId && !userId) {
        throw new Error('Either tradingAccountId or userId must be provided');
    }

    const allocationsExist = await AssetAllocation.exists({
        $or: [
            { user: userId },
            { tradingAccount: tradingAccountId }
        ]
    })


    return !!allocationsExist;
}