import { model } from 'mongoose';

const AdminBalance = model('AdminBalance');
const Pair = model('Pair');

// ADMIN BALANCE QUERY FUNCTIONS

/**
 * Get all admin balances grouped by pair
 * Returns human-readable amounts
 * 
 * @param {Object} options - Query options
 * @param {boolean} options.includeZeroBalances - Include balances with zero amounts
 * @returns {Object} Balances grouped by pair symbol
 */
export async function getAdminBalancesByPair({ includeZeroBalances = true } = {}) {
    const balances = await AdminBalance.find({
        ...(!includeZeroBalances && {
            $expr: {
                $or: [
                    { $gt: [{ $toLong: "$available" }, 0] },
                    { $gt: [{ $toLong: "$locked" }, 0] }
                ]
            }
        })
    }).populate('pair');

    // Group by pair (in smallest units)
    const grouped = {};

    for (const balance of balances) {
        if (!balance.pair) {
            throw new Error(`AdminBalance ${balance._id} is missing pair reference`);
        }

        const pairSymbol = balance.pair.symbol;

        if (!grouped[pairSymbol]) {
            grouped[pairSymbol] = {
                pair: balance.pair,
                networks: {},
                totals: {
                    available: '0',
                    locked: '0',
                    total: '0',
                    totalSweptIn: '0',
                    totalWithdrawnToUsers: '0',
                    totalWithdrawnToAdmin: '0'
                }
            };
        }

        const total = add(balance.available, balance.locked);

        grouped[pairSymbol].networks[balance.network] = {
            available: balance.available,
            locked: balance.locked,
            total
        };

        grouped[pairSymbol].totals.available = add(grouped[pairSymbol].totals.available, balance.available);
        grouped[pairSymbol].totals.locked = add(grouped[pairSymbol].totals.locked, balance.locked);
        grouped[pairSymbol].totals.total = add(grouped[pairSymbol].totals.total, total);
        grouped[pairSymbol].totals.totalSweptIn = add(grouped[pairSymbol].totals.totalSweptIn, balance.totalSweptIn);
        grouped[pairSymbol].totals.totalWithdrawnToUsers = add(grouped[pairSymbol].totals.totalWithdrawnToUsers, balance.totalWithdrawnToUsers);
        grouped[pairSymbol].totals.totalWithdrawnToAdmin = add(grouped[pairSymbol].totals.totalWithdrawnToAdmin, balance.totalWithdrawnToAdmin);
    }

    // Convert to human-readable
    const formatted = {};

    for (const [pairSymbol, data] of Object.entries(grouped)) {
        validateDecimals(data.pair.decimals);
        const decimals = data.pair.decimals;

        formatted[pairSymbol] = {
            pair: data.pair,
            networks: {},
            totals: {
                available: toReadableUnit(data.totals.available, decimals),
                locked: toReadableUnit(data.totals.locked, decimals),
                total: toReadableUnit(data.totals.total, decimals),
                totalSweptIn: toReadableUnit(data.totals.totalSweptIn, decimals),
                totalWithdrawnToUsers: toReadableUnit(data.totals.totalWithdrawnToUsers, decimals),
                totalWithdrawnToAdmin: toReadableUnit(data.totals.totalWithdrawnToAdmin, decimals)
            }
        };

        for (const [network, netData] of Object.entries(data.networks)) {
            formatted[pairSymbol].networks[network] = {
                available: toReadableUnit(netData.available, decimals),
                locked: toReadableUnit(netData.locked, decimals),
                total: toReadableUnit(netData.total, decimals)
            };
        }
    }

    return formatted;
}

/**
 * Get total admin balance for a specific pair across all networks
 * Returns human-readable amounts
 * 
 * @param {string} baseAsset - Asset symbol (e.g., 'USDT', 'ETH', 'BTC')
 * @returns {Object} Total balances and breakdown by network
 */
export async function getAdminTotalBalanceForPair(baseAsset) {
    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw Error(`Pair ${baseAsset} not found`);
    }

    validateDecimals(pair.decimals);

    const balances = await AdminBalance.find({ pair: pair._id });

    // Calculate totals in smallest units
    let totalAvailable = '0';
    let totalLocked = '0';
    let totalSweptIn = '0';
    let totalWithdrawnToUsers = '0';
    let totalWithdrawnToAdmin = '0';

    const byNetwork = {};

    balances.forEach(balance => {
        totalAvailable = add(totalAvailable, balance.available);
        totalLocked = add(totalLocked, balance.locked);
        totalSweptIn = add(totalSweptIn, balance.totalSweptIn);
        totalWithdrawnToUsers = add(totalWithdrawnToUsers, balance.totalWithdrawnToUsers);
        totalWithdrawnToAdmin = add(totalWithdrawnToAdmin, balance.totalWithdrawnToAdmin);

        const networkTotal = add(balance.available, balance.locked);

        byNetwork[balance.network] = {
            available: balance.available,
            locked: balance.locked,
            total: networkTotal
        };
    });

    const decimals = pair.decimals;
    const totalAmount = add(totalAvailable, totalLocked);

    // Format to human-readable
    const formattedByNetwork = {};
    for (const [network, data] of Object.entries(byNetwork)) {
        formattedByNetwork[network] = {
            available: toReadableUnit(data.available, decimals),
            locked: toReadableUnit(data.locked, decimals),
            total: toReadableUnit(data.total, decimals)
        };
    }

    return {
        pair: {
            _id: pair._id,
            symbol: pair.symbol,
            baseAsset: pair.baseAsset,
            decimals: pair.decimals
        },
        totals: {
            available: toReadableUnit(totalAvailable, decimals),
            locked: toReadableUnit(totalLocked, decimals),
            total: toReadableUnit(totalAmount, decimals),
            totalSweptIn: toReadableUnit(totalSweptIn, decimals),
            totalWithdrawnToUsers: toReadableUnit(totalWithdrawnToUsers, decimals),
            totalWithdrawnToAdmin: toReadableUnit(totalWithdrawnToAdmin, decimals)
        },
        byNetwork: formattedByNetwork
    };
}

// ADMIN BALANCE MODIFICATION FUNCTIONS

/**
 * Add balance to admin (when sweeping from users)
 * Input: human-readable amount
 * Output: human-readable result
 * 
 * @param {string} baseAsset - Asset symbol
 * @param {string} amount - Human-readable amount (e.g., "100.5")
 * @param {string} targetNetwork - Network to add balance to
 * @returns {Object} Transaction details
 */
export async function addAdminBalance(baseAsset, amount, targetNetwork) {
    validatePositiveAmount(amount, 'amount');

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw Error(`Pair ${baseAsset} not found`);
    }

    validateDecimals(pair.decimals);

    const amountSmallest = toSmallestUnit(amount, pair.decimals);

    const balance = await AdminBalance.findOne({
        pair: pair._id,
        network: targetNetwork
    });

    if (!balance) {
        throw new Error(`No admin balance found for ${baseAsset} on ${targetNetwork}`);
    }

    balance.available = add(balance.available, amountSmallest);
    balance.totalSweptIn = add(balance.totalSweptIn, amountSmallest);
    balance.lastSweepAt = new Date();

    await balance.save();

    return {
        baseAsset,
        network: targetNetwork,
        amount: toReadableUnit(amountSmallest, pair.decimals),
        newAvailable: toReadableUnit(balance.available, pair.decimals),
        balanceId: balance._id
    };
}

/**
 * Deduct balance from admin (for withdrawals)
 * Input: human-readable amount
 * Output: human-readable result
 * 
 * @param {string} baseAsset - Asset symbol
 * @param {string} amount - Human-readable amount
 * @param {string} withdrawalType - 'user' or 'admin'
 * @param {string} sourceNetwork - Specific network to deduct from (optional)
 * @returns {Object} Transaction details
 */
export async function deductAdminBalance(
    baseAsset,
    amount,
    withdrawalType = 'user',
    sourceNetwork = null
) {
    validatePositiveAmount(amount, 'amount');

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw Error(`Pair ${baseAsset} not found`);
    }

    validateDecimals(pair.decimals);

    const amountSmallest = toSmallestUnit(amount, pair.decimals);

    let balances = await AdminBalance.find({
        pair: pair._id
    }).sort({ available: -1 });

    if (balances.length === 0) {
        throw new Error(`No admin balance records found for pair: ${baseAsset}`);
    }

    // If source network specified, deduct from that network only
    if (sourceNetwork) {
        const balance = balances.find(b => b.network === sourceNetwork);
        if (!balance) {
            throw new Error(`No admin balance found for ${baseAsset} on ${sourceNetwork}`);
        }

        if (!isGreaterOrEqual(balance.available, amountSmallest)) {
            throw new Error(
                `Insufficient admin balance on ${sourceNetwork}. Available: ${toReadableUnit(balance.available, pair.decimals)}, Required: ${amount}`
            );
        }

        balance.available = subtract(balance.available, amountSmallest);

        if (withdrawalType === 'user') {
            balance.totalWithdrawnToUsers = add(balance.totalWithdrawnToUsers, amountSmallest);
        } else {
            balance.totalWithdrawnToAdmin = add(balance.totalWithdrawnToAdmin, amountSmallest);
        }

        balance.lastWithdrawalAt = new Date();

        await balance.save();

        return {
            network: sourceNetwork,
            amount: toReadableUnit(amountSmallest, pair.decimals),
            balanceId: balance._id
        };
    }

    // Otherwise, deduct from balances with highest availability
    let remaining = amountSmallest;
    const deducted = [];

    for (const balance of balances) {
        if (compare(remaining, '0') <= 0) break;

        if (compare(balance.available, '0') <= 0) continue;

        const toDeduct = min(balance.available, remaining);

        balance.available = subtract(balance.available, toDeduct);

        if (withdrawalType === 'user') {
            balance.totalWithdrawnToUsers = add(balance.totalWithdrawnToUsers, toDeduct);
        } else {
            balance.totalWithdrawnToAdmin = add(balance.totalWithdrawnToAdmin, toDeduct);
        }

        const prevWithdrawalAt = balance.lastWithdrawalAt;

        balance.lastWithdrawalAt = new Date();

        await balance.save();

        deducted.push({
            balanceId: balance._id,
            network: balance.network,
            amount: toReadableUnit(toDeduct, pair.decimals),
            prevWithdrawalAt,
            lastWithdrawalAt:balance.lastWithdrawalAt
        });

        remaining = subtract(remaining, toDeduct);
    }

    if (compare(remaining, '0') > 0) {
        throw new Error(
            `Insufficient admin balance. Required: ${amount}, Missing: ${toReadableUnit(remaining, pair.decimals)}`
        );
    }

    return { distributions: deducted };
}

/**
 * Lock admin balance (for pending withdrawals)
 * Input: human-readable amount
 * Output: distributions in smallest units
 * 
 * @param {string} baseAsset - Asset symbol
 * @param {string} amount - Human-readable amount
 * @param {string} preferredNetwork - Preferred network to lock from
 * @returns {Object} Lock details with distributions
 */
export async function lockAdminBalance(baseAsset, amount, preferredNetwork = null) {
    validatePositiveAmount(amount, 'amount');

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw Error(`Pair ${baseAsset} not found`);
    }

    validateDecimals(pair.decimals);
    const amountSmallest = toSmallestUnit(amount, pair.decimals);

    let balances = await AdminBalance.find({
        pair: pair._id
    }).sort({ available: -1 });

    if (balances.length === 0) {
        throw new Error(`No admin balance records found for pair: ${baseAsset}`);
    }

    // Prefer specific network if specified
    if (preferredNetwork) {
        balances = balances.sort((a, b) => {
            if (a.network === preferredNetwork) return -1;
            if (b.network === preferredNetwork) return 1;
            return compare(b.available, a.available);
        });
    }

    // PHASE 1: Calculate distribution WITHOUT modifying anything
    let remaining = amountSmallest;
    const plannedLocks = [];

    for (const balance of balances) {
        if (compare(remaining, '0') <= 0) break;
        if (compare(balance.available, '0') <= 0) continue;

        const toLock = min(balance.available, remaining);

        plannedLocks.push({
            balanceId: balance._id,
            network: balance.network,
            amount: toLock
        });

        remaining = subtract(remaining, toLock);
    }

    // PHASE 2: Verify we have enough BEFORE making any changes
    if (compare(remaining, '0') > 0) {
        throw new Error(
            `Insufficient admin balance. Required: ${amount}, Missing: ${toReadableUnit(remaining, pair.decimals)}`
        );
    }

    // PHASE 3: Now apply all locks (we know we have enough)
    for (const planned of plannedLocks) {
        const balance = await AdminBalance.findById(planned.balanceId);
        if (!balance) {
            throw new Error(`AdminBalance ${planned.balanceId} not found`);
        }

        balance.available = subtract(balance.available, planned.amount);
        balance.locked = add(balance.locked, planned.amount);
        balance.lastLockedAt = new Date();
        await balance.save();
    }

    return {
        totalLocked: toReadableUnit(amountSmallest, pair.decimals),
        distributions: plannedLocks // Keep in smallest units
    };
}

/**
 * Unlock admin balance (when withdrawal is cancelled)
 * Input: distributions in smallest units from lockAdminBalance
 * 
 * @param {string} baseAsset - Asset symbol
 * @param {Array} distributions - Array of locked distributions
 * @returns {Object} Success status
 */
export async function unlockAdminBalance(baseAsset, distributions) {
    if (!distributions || distributions.length === 0) {
        throw new Error('No distributions provided for unlock');
    }

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw Error(`Pair ${baseAsset} not found`);
    }

    validateDecimals(pair.decimals);

    const errors = [];
    let totalUnlocked = '0';

    for (const dist of distributions) {
        try {
            const balance = await AdminBalance.findById(dist.balanceId);
            if (!balance) {
                errors.push(`AdminBalance ${dist.balanceId} not found - funds may be permanently locked`);
                continue;
            }

            // Verify sufficient locked balance
            if (!isGreaterOrEqual(balance.locked, dist.amount)) {
                errors.push(
                    `Insufficient locked balance ${dist.balanceId}. ` +
                    `Locked: ${balance.locked}, Attempting to unlock: ${dist.amount}`
                );
                continue;
            }

            balance.locked = subtract(balance.locked, dist.amount);
            balance.available = add(balance.available, dist.amount);
            balance.lastUnlockedAt = new Date();
            await balance.save();

            totalUnlocked = add(totalUnlocked, dist.amount);
        } catch (error) {
            errors.push(`Failed to unlock AdminBalance ${dist.balanceId}: ${error.message}`);
        }
    }

    if (errors.length > 0) {
        throw new Error(`Unlock completed with errors: ${errors.join('; ')}`);
    }

    return {
        totalUnlocked: toReadableUnit(totalUnlocked, pair.decimals)
    };
}

/**
 * Finalize locked admin balance (when withdrawal completes)
 * Input: distributions in smallest units
 * 
 * @param {string} baseAsset - Asset symbol
 * @param {Array} distributions - Array of locked distributions
 * @param {string} withdrawalType - 'user' or 'admin'
 * @returns {Object} Success status
 */
export async function finalizeLockedAdminBalance(baseAsset, distributions, withdrawalType = 'user') {
    if (!distributions || distributions.length === 0) {
        throw new Error('No distributions provided for finalization');
    }

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
        throw Error(`Pair ${baseAsset} not found`);
    }

    validateDecimals(pair.decimals);

    const errors = [];
    let totalFinalized = '0';

    for (const dist of distributions) {
        try {
            const balance = await AdminBalance.findById(dist.balanceId);
            if (!balance) {
                errors.push(`AdminBalance ${dist.balanceId} not found - funds may be permanently locked`);
                continue;
            }

            // Verify sufficient locked balance
            if (!isGreaterOrEqual(balance.locked, dist.amount)) {
                errors.push(
                    `Insufficient locked balance ${dist.balanceId}. ` +
                    `Locked: ${balance.locked}, Attempting to finalize: ${dist.amount}`
                );
                continue;
            }

            balance.locked = subtract(balance.locked, dist.amount);

            if (withdrawalType === 'user') {
                balance.totalWithdrawnToUsers = add(balance.totalWithdrawnToUsers, dist.amount);
            } else {
                balance.totalWithdrawnToAdmin = add(balance.totalWithdrawnToAdmin, dist.amount);
            }

            balance.lastWithdrawalAt = new Date();

            await balance.save();

            totalFinalized = add(totalFinalized, dist.amount);
        } catch (error) {
            errors.push(`Failed to finalize AdminBalance ${dist.balanceId}: ${error.message}`);
        }
    }

    if (errors.length > 0) {
        throw new Error(`Finalization completed with errors: ${errors.join('; ')}`);
    }

    return {
        totalFinalized: toReadableUnit(totalFinalized, pair.decimals)
    };
}