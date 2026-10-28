const Pair = getModel('Pair');
const Wallet = getModel('Wallet');
const Balance = getModel('Balance');

// BALANCE FORMATTING UTILITIES

/**
 * Format grouped balances to human-readable
 * Each pair uses its own decimals
 */
function formatGroupedBalances(grouped) {
  const formatted = {};

  for (const [pairSymbol, data] of Object.entries(grouped)) {
    validateDecimals(data.pair.decimals);
    const decimals = data.pair.decimals;

    formatted[pairSymbol] = {
      pair: data.pair,
      networks: {},
      totals: {
        initial: toReadableUnit(data.totals.initial, decimals),
        available: toReadableUnit(data.totals.available, decimals),
        locked: toReadableUnit(data.totals.locked, decimals),
        total: toReadableUnit(data.totals.total, decimals),
        totalDeposited: toReadableUnit(data.totals.totalDeposited, decimals),
        totalAllocated: toReadableUnit(data.totals.totalAllocated, decimals),
        totalWithdrawn: toReadableUnit(data.totals.totalWithdrawn, decimals)
      }
    };

    for (const [network, netData] of Object.entries(data.networks)) {
      formatted[pairSymbol].networks[network] = {
        initial: toReadableUnit(netData.initial, decimals),
        available: toReadableUnit(netData.available, decimals),
        locked: toReadableUnit(netData.locked, decimals),
        total: toReadableUnit(netData.total, decimals)
      };
    }
  }

  return formatted;
}

// BALANCE QUERY FUNCTIONS

/**
 * Get all balances for a trading account grouped by pair
 * Returns human-readable amounts
 */
export async function getBalancesByPair(tradingAccountId, { includeZeroBalances = true } = {}) {
  const wallets = await Wallet.find({ tradingAccount: tradingAccountId }).select('_id').lean();

  if (wallets.length === 0) {
    return {}; // No wallets = no balances
  }

  const walletIds = wallets.map(w => w._id);

  const balances = await Balance.find({
    wallet: { $in: walletIds },
    ...(!includeZeroBalances && {
      $expr: {
        $or: [
          { $gt: [{ $toLong: "$available" }, 0] },
          { $gt: [{ $toLong: "$locked" }, 0] }
        ]
      }
    })
  }).populate('pair');

  if (balances.length === 0) {
    return {}; // No balances found
  }

  // Group by pair (in smallest units)
  const grouped = {};

  let usdtAllocationsIncluded = false

  for (const balance of balances) {
    if (!balance.pair) {
      throw new Error(`Balance ${balance._id} is missing pair reference`);
    }

    const pairSymbol = balance.pair.symbol;

    if (!grouped[pairSymbol]) {
      grouped[pairSymbol] = {
        pair: balance.pair,
        networks: {},
        totals: {
          initial: '0',
          available: '0',
          locked: '0',
          total: '0',
          totalDeposited: '0',
          totalAllocated: '0',
          totalWithdrawn: '0'
        }
      };
    }

    const total = add(balance.available, balance.locked);

    grouped[pairSymbol].networks[balance.network] = {
      initial: balance.initial,
      available: balance.available,
      locked: balance.locked,
      total
    };


    if (balance.pair.baseAsset === "USDT") {
      if (!usdtAllocationsIncluded) {
        const { totals } = await getAllocationForPair({ tradingAccountId }, "USDT")

        grouped[pairSymbol].totals.available = add(grouped[pairSymbol].totals.available, toSmallestUnit(totals.available, balance.pair.decimals));
        grouped[pairSymbol].totals.locked = add(grouped[pairSymbol].totals.locked, toSmallestUnit(totals.locked, balance.pair.decimals));
        grouped[pairSymbol].totals.total = add(grouped[pairSymbol].totals.total, toSmallestUnit(totals.total, balance.pair.decimals));

        usdtAllocationsIncluded = true
      };

    }

    grouped[pairSymbol].totals.initial = add(grouped[pairSymbol].totals.initial, balance.initial);
    grouped[pairSymbol].totals.available = add(grouped[pairSymbol].totals.available, balance.available);
    grouped[pairSymbol].totals.locked = add(grouped[pairSymbol].totals.locked, balance.locked);
    grouped[pairSymbol].totals.total = add(grouped[pairSymbol].totals.total, total);
    grouped[pairSymbol].totals.totalDeposited = add(grouped[pairSymbol].totals.totalDeposited, balance.totalDeposited);
    grouped[pairSymbol].totals.totalAllocated = add(grouped[pairSymbol].totals.totalAllocated, balance.totalAllocated);
    grouped[pairSymbol].totals.totalWithdrawn = add(grouped[pairSymbol].totals.totalWithdrawn, balance.totalWithdrawn);

  }

  return formatGroupedBalances(grouped);
}

/**
 * Get total balance for a specific pair across all networks
 * Returns human-readable amounts
 */
export async function getTotalBalanceForPair(tradingAccountId, baseAsset, { session } = {}) {
  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw Error(`Pair ${baseAsset} not found`)
  }

  validateDecimals(pair.decimals);

  const wallets = await Wallet.find({ tradingAccount: tradingAccountId }).select('_id').session(session).lean();
  const walletIds = wallets.map(w => w._id);

  const balances = await Balance.find({
    wallet: { $in: walletIds },
    pair: pair._id
  }).session(session).populate('pair');

  // Calculate totals in smallest units
  let totalInitial = '0';
  let totalAvailable = '0';
  let totalLocked = '0';
  let totalDeposited = '0';
  let totalAllocated = '0';
  let totalWithdrawn = '0';

  const byNetwork = {};

  balances.forEach(balance => {
    totalInitial = add(totalInitial, balance.initial);
    totalAvailable = add(totalAvailable, balance.available);
    totalLocked = add(totalLocked, balance.locked);
    totalDeposited = add(totalDeposited, balance.totalDeposited);
    totalAllocated = add(totalAllocated, balance.totalAllocated);
    totalWithdrawn = add(totalWithdrawn, balance.totalWithdrawn);

    const networkTotal = add(balance.available, balance.locked);

    byNetwork[balance.network] = {
      initial: balance.initial,
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
      initial: toReadableUnit(data.initial, decimals),
      available: toReadableUnit(data.available, decimals),
      locked: toReadableUnit(data.locked, decimals),
      total: toReadableUnit(data.total, decimals)
    };
  }

  return {
    pair,
    totals: {
      initial: toReadableUnit(totalInitial, decimals),
      available: toReadableUnit(totalAvailable, decimals),
      locked: toReadableUnit(totalLocked, decimals),
      total: toReadableUnit(totalAmount, decimals),
      totalDeposited: toReadableUnit(totalDeposited, decimals),
      totalAllocated: toReadableUnit(totalAllocated, decimals),
      totalWithdrawn: toReadableUnit(totalWithdrawn, decimals)
    },
    byNetwork: formattedByNetwork
  };
}

// BALANCE MODIFICATION FUNCTIONS

/**
 * Add deposit (predeposited (eg in demos) or user deposits or orders)
 * Input: human-readable amount, Output: human-readable result
 */
export async function addUserDeposit(
  tradingAccountId,
  baseAsset,
  amount, // human-readable
  targetNetwork = null,
  { preDeposited = false, session } = {}
) {
  validatePositiveAmount(amount, 'amount');

  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw Error(`Pair ${baseAsset} not found`)
  }

  validateDecimals(pair.decimals);

  const amountSmallest = toSmallestUnit(amount, pair.decimals);

  const wallets = await Wallet.find({ tradingAccount: tradingAccountId }).select('_id').session(session).lean();
  const walletIds = wallets.map(w => w._id);

  const balance = await Balance.findOne({
    wallet: { $in: walletIds },
    pair: pair._id,
    ...(targetNetwork && {
      network: targetNetwork
    })
  }).session(session);

  if (!balance) {
    throw new Error(`No balance record found for network: ${targetNetwork}`);
  }

  await casUpdate(Balance, balance._id, ['initial', 'available', 'totalDeposited'], (current) => ({
    ...(preDeposited && { initial: add(current.initial, amountSmallest) }),
    available: add(current.available, amountSmallest),
    totalDeposited: add(current.totalDeposited, amountSmallest),
    lastDepositAt: new Date()
  }), { session });

  return {
    network: targetNetwork,
    amount: toReadableUnit(amountSmallest, pair.decimals),
    balanceId: balance._id
  };
}

/**
 * Add PnL to any available balance for a trading account
 * Input: human-readable amount
 */
export async function addTradingAccountPnL(
  tradingAccountId,
  baseAsset,
  amount, // human-readable (can be positive or negative)
  targetNetwork = null
) {
  const isProfit = parseFloat(amount) >= 0;
  const absAmount = Math.abs(parseFloat(amount));

  if (absAmount === 0) {
    throw new Error('PnL amount must not be zero');
  }

  validatePositiveAmount(absAmount.toString(), 'amount');

  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw new Error(`Pair ${baseAsset} not found`);
  }

  validateDecimals(pair.decimals);
  const amountSmallest = toSmallestUnit(absAmount.toString(), pair.decimals);

  const wallets = await Wallet.find({ tradingAccount: tradingAccountId }).select('_id').lean();
  const walletIds = wallets.map(w => w._id);

  const balance = await Balance.findOne({
    wallet: { $in: walletIds },
    pair: pair._id,
    ...(targetNetwork && { network: targetNetwork })
  });

  if (!balance) {
    throw new Error(`No balance record found for network: ${targetNetwork || 'any'}`);
  }

  // Apply PnL to available and totalPnL
  await casUpdate(Balance, balance._id, ['available', 'totalPnL'], (current) => {
    if (isProfit) {
      return {
        available: add(current.available, amountSmallest),
        totalPnL: add(current.totalPnL, amountSmallest),
        lastSettledAt: new Date()
      };
    }

    // For losses, drain to 0 if insufficient balance (negative balance protection)
    return {
      available: isGreaterOrEqual(amountSmallest, current.available)
        ? '0'
        : subtract(current.available, amountSmallest),
      totalPnL: subtract(current.totalPnL, amountSmallest),
      lastSettledAt: new Date()
    };
  });

  return {
    network: balance.network,
    amount: toReadableUnit(amountSmallest, pair.decimals),
    balanceId: balance._id,
    isProfit
  };
}

/**
 * Remove withdrawal
 * Input: human-readable amount, Output: human-readable result
 */
export async function removeUserWithdrawalFromBalances(
  tradingAccountId,
  baseAsset,
  amount, // human-readable
  sourceNetwork = null,
  { session } = {}
) {


  try {
    validatePositiveAmount(amount, 'amount');

    const pair = await Pair.findOne({ baseAsset });
    if (!pair) {
      throw Error(`Pair ${baseAsset} not found`)
    }

    validateDecimals(pair.decimals);

    const amountSmallest = toSmallestUnit(amount, pair.decimals);

    const wallets = await Wallet.find({ tradingAccount: tradingAccountId }).select('_id').session(session).lean();
    const walletIds = wallets.map(w => w._id);

    let balances = await Balance.find({
      wallet: { $in: walletIds },
      pair: pair._id,
    }).session(session).sort({ available: -1 });

    if (balances.length === 0) {
      throw new Error(`No balance records found for pair: ${baseAsset}`);
    }

    const removed = [];

    // If source network specified, remove from that network only
    if (sourceNetwork) {
      const balance = balances.find(b => b.network === sourceNetwork);
      if (!balance) {
        throw new Error(`No balance record found for network: ${sourceNetwork}`);
      }

      if (!isGreaterOrEqual(balance.available, amountSmallest)) {
        throw new Error(
          `Insufficient balance on ${sourceNetwork}. Available: ${toReadableUnit(balance.available, pair.decimals)}, Required: ${amount}`
        );
      }

      const prevLastWithdrawalAt = balance.lastWithdrawalAt || null;

      await casUpdate(Balance, balance._id, ['available', 'totalWithdrawn'], (current) => {
        if (!isGreaterOrEqual(current.available, amountSmallest)) {
          throw new Error(
            `Insufficient balance on ${sourceNetwork}. Available: ${toReadableUnit(current.available, pair.decimals)}, Required: ${amount}`
          );
        }

        return {
          available: subtract(current.available, amountSmallest),
          totalWithdrawn: add(current.totalWithdrawn, amountSmallest),
          lastWithdrawalAt: new Date()
        };
      }, { session });

      removed.push({
        network: sourceNetwork,
        amount: toReadableUnit(amountSmallest, pair.decimals),
        amountSmallest,
        prevLastWithdrawalAt,
        balanceId: balance._id
      });

    } else {

      // Otherwise, remove from balances with highest availability
      let remaining = amountSmallest;

      for (const balance of balances) {
        if (compare(remaining, '0') <= 0) break;

        if (compare(balance.available, '0') <= 0) continue; //skip zero balances

        const prevLastWithdrawalAt = balance.lastWithdrawalAt || null;

        // Recomputed against fresh values on every retry, so the amount taken
        // reflects what is actually available when the write lands.
        let toRemove = '0';

        await casUpdate(Balance, balance._id, ['available', 'totalWithdrawn'], (current) => {
          toRemove = min(current.available, remaining);

          return {
            available: subtract(current.available, toRemove),
            totalWithdrawn: add(current.totalWithdrawn, toRemove),
            lastWithdrawalAt: new Date()
          };
        }, { session });

        if (compare(toRemove, '0') <= 0) continue;

        removed.push({
          balanceId: balance._id,
          network: balance.network,
          amountSmallest: toRemove,
          amount: toReadableUnit(toRemove, pair.decimals),
          prevLastWithdrawalAt
        });

        remaining = subtract(remaining, toRemove);
      }

      if (compare(remaining, '0') > 0) {
        throw new Error(
          `Insufficient balance. Required: ${amount}, Missing: ${toReadableUnit(remaining, pair.decimals)}`
        );
      }
    }

    return { distributions: removed };
  } catch (error) {
    throw error;

  }
  
}

// ORDER-RELATED BALANCE OPERATIONS

/**
 * Lock balance for an order
 * Input: human-readable amount, Output: distributions in smallest units (for settlement)
 */
export async function lockUserAssetBalances(
  tradingAccountId,
  baseAsset,
  amount, // human-readable
  preferredNetwork = null
) {
  validatePositiveAmount(amount, 'amount');

  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw Error(`Pair ${baseAsset} not found`);
  }

  validateDecimals(pair.decimals);
  const amountSmallest = toSmallestUnit(amount, pair.decimals);

  const wallets = await Wallet.find({ tradingAccount: tradingAccountId }).select('_id').lean();
  const walletIds = wallets.map(w => w._id);

  let balances = await Balance.find({
    wallet: { $in: walletIds },
    pair: pair._id
  }).sort({ available: -1 });

  if (balances.length === 0) {
    throw new Error(`No balance records found for pair: ${baseAsset}`);
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

    const prevLastLockedAt = balance.lastLockedAt || null;

    plannedLocks.push({
      balanceId: balance._id,
      network: balance.network,
      amount: toLock,
      prevLastLockedAt
    });

    remaining = subtract(remaining, toLock);
  }

  // PHASE 2: Verify we have enough BEFORE making any changes
  if (compare(remaining, '0') > 0) {
    throw new Error(
      `Insufficient balance. Required: ${amount}, Missing: ${toReadableUnit(remaining, pair.decimals)}`
    );
  }

  // PHASE 3: Apply each lock atomically. The plan was computed from a snapshot,
  // so every lock re-checks availability at write time; if one fails, the locks
  // already applied are released again so no funds are left stranded.
  const appliedLocks = [];

  try {
    for (const planned of plannedLocks) {
      const updated = await casUpdate(Balance, planned.balanceId, ['available', 'locked'], (current) => {
        if (!isGreaterOrEqual(current.available, planned.amount)) {
          throw new Error(
            `Insufficient balance. Required: ${amount}, balance ${planned.balanceId} changed during locking`
          );
        }

        return {
          available: subtract(current.available, planned.amount),
          locked: add(current.locked, planned.amount),
          lastLockedAt: new Date()
        };
      });

      if (!updated) {
        throw new Error(`Balance ${planned.balanceId} not found`);
      }

      appliedLocks.push(planned);
    }
  } catch (error) {
    for (const applied of appliedLocks) {
      await casUpdate(Balance, applied.balanceId, ['available', 'locked'], (current) => ({
        available: add(current.available, applied.amount),
        locked: max('0', subtract(current.locked, applied.amount)),
        lastLockedAt: applied.prevLastLockedAt || undefined
      }));
    }

    throw error;
  }

  return {
    totalLocked: toReadableUnit(amountSmallest, pair.decimals),
    distributions: plannedLocks // Keep in smallest units for settlement
  };
}

/**
 * Unlock balance (eg when order is cancelled or funds unfreezed)
 * Input: distributions in smallest units from lockBalanceForOrder
 */
export async function unlockUserAssetBalances(baseAsset, distributions) {
  if (!distributions || distributions.length === 0) {
    throw new Error('No distributions provided for unlock');
  }

  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw Error(`Pair ${baseAsset} not found`);
  }

  validateDecimals(pair.decimals);

  const errors = [];
  const unlockedDistributions = [];
  let totalUnlocked = '0';

  for (const dist of distributions) {
    try {
      let lockedShort = null;
      let prevLastUnlockedAt;

      const updated = await casUpdate(Balance, dist.balanceId, ['available', 'locked'], (current, raw) => {
        // Before subtracting, verify sufficient locked balance
        if (!isGreaterOrEqual(current.locked, dist.amount)) {
          lockedShort = current.locked;
          return null;
        }

        lockedShort = null;
        prevLastUnlockedAt = raw.lastUnlockedAt;

        return {
          locked: subtract(current.locked, dist.amount),
          available: add(current.available, dist.amount),
          //handle rollback cases
          ...(dist.lastLockedAt
            ? { lastLockedAt: dist.lastLockedAt }
            : { lastUnlockedAt: new Date() })
        };
      });

      if (!updated) {
        errors.push(`Balance ${dist.balanceId} not found - funds may be permanently locked`);
        continue;
      }

      if (lockedShort !== null) {
        errors.push(
          `Insufficient locked balance ${dist.balanceId}. ` +
          `Locked: ${lockedShort}, Attempting to unlock: ${dist.amount}`
        );
        continue;
      }

      unlockedDistributions.push({
        ...dist,
        prevLastUnlockedAt,
      })

      totalUnlocked = add(totalUnlocked, dist.amount);
    } catch (error) {
      errors.push(`Failed to unlock balance ${dist.balanceId}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Unlock completed with errors: ${errors.join('; ')}`);
  }

  return {
    totalUnlocked: toReadableUnit(totalUnlocked, pair.decimals),
    unlockedDistributions
  };
}