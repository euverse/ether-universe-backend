import { model } from 'mongoose';
import { WITHDRAWAL_TYPES } from '~/db/schemas/UserWithdrawal';

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

    const updated = await casUpdate(AdminBalance, balance._id, ['available', 'totalSweptIn'], (current) => ({
        available: add(current.available, amountSmallest),
        totalSweptIn: add(current.totalSweptIn, amountSmallest),
        lastSweepAt: new Date()
    }));

    return {
        baseAsset,
        network: targetNetwork,
        amount: toReadableUnit(amountSmallest, pair.decimals),
        newAvailable: toReadableUnit(updated.available, pair.decimals),
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

    try {

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

        const deducted = [];

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

            const prevLastWithdrawalAt = balance.lastWithdrawalAt || null;
            const totalField = withdrawalType === WITHDRAWAL_TYPES.USER ? 'totalWithdrawnToUsers' : 'totalWithdrawnToAdmin';

            await casUpdate(AdminBalance, balance._id, ['available', totalField], (current) => {
                if (!isGreaterOrEqual(current.available, amountSmallest)) {
                    throw new Error(
                        `Insufficient admin balance on ${sourceNetwork}. Available: ${toReadableUnit(current.available, pair.decimals)}, Required: ${amount}`
                    );
                }

                return {
                    available: subtract(current.available, amountSmallest),
                    [totalField]: add(current[totalField], amountSmallest),
                    lastWithdrawalAt: new Date()
                };
            });

            deducted.push({
                network: sourceNetwork,
                amountSmallest,
                amount: toReadableUnit(amountSmallest, pair.decimals),
                balanceId: balance._id,
                prevLastWithdrawalAt,
                withdrawalType
            })

        } else {
            // Otherwise, deduct from balances with highest availability
            let remaining = amountSmallest;

            for (const balance of balances) {
                if (compare(remaining, '0') <= 0) break;

                if (compare(balance.available, '0') <= 0) continue;

                const prevLastWithdrawalAt = balance.lastWithdrawalAt || null;
                const totalField = withdrawalType === 'user' ? 'totalWithdrawnToUsers' : 'totalWithdrawnToAdmin';

                // Recomputed against fresh values on every retry, so the amount taken
                // reflects what is actually available when the write lands.
                let toDeduct = '0';
                const lastWithdrawalAt = new Date();

                await casUpdate(AdminBalance, balance._id, ['available', totalField], (current) => {
                    toDeduct = min(current.available, remaining);

                    return {
                        available: subtract(current.available, toDeduct),
                        [totalField]: add(current[totalField], toDeduct),
                        lastWithdrawalAt
                    };
                });

                if (compare(toDeduct, '0') <= 0) continue;

                deducted.push({
                    balanceId: balance._id,
                    network: balance.network,
                    amountSmallest: toDeduct,
                    amount: toReadableUnit(toDeduct, pair.decimals),
                    prevLastWithdrawalAt,
                    lastWithdrawalAt
                });

                remaining = subtract(remaining, toDeduct);
            }

            if (compare(remaining, '0') > 0) {
                throw new Error(
                    `Insufficient admin balance. Required: ${amount}, Missing: ${toReadableUnit(remaining, pair.decimals)}`
                );
            }
        }

        return { withdrawalType, distributions: deducted };
    } catch (error) {
        throw error;
    }
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

    // PHASE 3: Apply each lock atomically. The plan was computed from a snapshot,
    // so every lock re-checks availability at write time; if one fails, the locks
    // already applied are released again so no funds are left stranded.
    const appliedLocks = [];

    try {
        for (const planned of plannedLocks) {
            const updated = await casUpdate(AdminBalance, planned.balanceId, ['available', 'locked'], (current) => {
                if (!isGreaterOrEqual(current.available, planned.amount)) {
                    throw new Error(
                        `Insufficient admin balance. Required: ${amount}, balance ${planned.balanceId} changed during locking`
                    );
                }

                return {
                    available: subtract(current.available, planned.amount),
                    locked: add(current.locked, planned.amount),
                    lastLockedAt: new Date()
                };
            });

            if (!updated) {
                throw new Error(`AdminBalance ${planned.balanceId} not found`);
            }

            appliedLocks.push(planned);
        }
    } catch (error) {
        for (const applied of appliedLocks) {
            await casUpdate(AdminBalance, applied.balanceId, ['available', 'locked'], (current) => ({
                available: add(current.available, applied.amount),
                locked: max('0', subtract(current.locked, applied.amount))
            }));
        }

        throw error;
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
            let lockedShort = null;

            const updated = await casUpdate(AdminBalance, dist.balanceId, ['available', 'locked'], (current) => {
                // Verify sufficient locked balance
                if (!isGreaterOrEqual(current.locked, dist.amount)) {
                    lockedShort = current.locked;
                    return null;
                }

                lockedShort = null;

                return {
                    locked: subtract(current.locked, dist.amount),
                    available: add(current.available, dist.amount),
                    lastUnlockedAt: new Date()
                };
            });

            if (!updated) {
                errors.push(`AdminBalance ${dist.balanceId} not found - funds may be permanently locked`);
                continue;
            }

            if (lockedShort !== null) {
                errors.push(
                    `Insufficient locked balance ${dist.balanceId}. ` +
                    `Locked: ${lockedShort}, Attempting to unlock: ${dist.amount}`
                );
                continue;
            }

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
            const totalField = withdrawalType === 'user' ? 'totalWithdrawnToUsers' : 'totalWithdrawnToAdmin';
            let lockedShort = null;

            const updated = await casUpdate(AdminBalance, dist.balanceId, ['locked', totalField], (current) => {
                // Verify sufficient locked balance
                if (!isGreaterOrEqual(current.locked, dist.amount)) {
                    lockedShort = current.locked;
                    return null;
                }

                lockedShort = null;

                return {
                    locked: subtract(current.locked, dist.amount),
                    [totalField]: add(current[totalField], dist.amount),
                    lastWithdrawalAt: new Date()
                };
            });

            if (!updated) {
                errors.push(`AdminBalance ${dist.balanceId} not found - funds may be permanently locked`);
                continue;
            }

            if (lockedShort !== null) {
                errors.push(
                    `Insufficient locked balance ${dist.balanceId}. ` +
                    `Locked: ${lockedShort}, Attempting to finalize: ${dist.amount}`
                );
                continue;
            }

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