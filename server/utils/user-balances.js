
const Pair = getModel('Pair');
const Wallet = getModel('Wallet');
const Balance = getModel('Balance');

// ============================================
// BALANCE FORMATTING UTILITIES
// ============================================

/**
 * Format balance object to human-readable
 */
function formatBalanceToReadable(balance, decimals) {
  return {
    ...balance.toObject(),
    initial: toReadableUnit(balance.initial, decimals),
    available: toReadableUnit(balance.available, decimals),
    locked: toReadableUnit(balance.locked, decimals),
    total: toReadableUnit(add(balance.available, balance.locked), decimals),
    totalDeposited: toReadableUnit(balance.totalDeposited, decimals),
    totalAllocated: toReadableUnit(balance.totalAllocated, decimals),
    totalWithdrawn: toReadableUnit(balance.totalWithdrawn, decimals)
  };
}

/**
 * Format grouped balances to human-readable
 */
function formatGroupedBalances(grouped, decimals) {
  const formatted = {};

  for (const [pairSymbol, data] of Object.entries(grouped)) {
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

// ============================================
// BALANCE QUERY FUNCTIONS
// ============================================

/**
 * Get all balances for a trading account grouped by pair
 * Returns human-readable amounts
 */
export async function getBalancesByPair(tradingAccountId, { includeZeroBalances = true } = {}) {
  const wallets = await Wallet.find({ tradingAccount: tradingAccountId });
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

  // Group by pair (in smallest units)
  const grouped = {};

  for (const balance of balances) {
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

    grouped[pairSymbol].totals.initial = add(grouped[pairSymbol].totals.initial, balance.initial);
    grouped[pairSymbol].totals.available = add(grouped[pairSymbol].totals.available, balance.available);
    grouped[pairSymbol].totals.locked = add(grouped[pairSymbol].totals.locked, balance.locked);
    grouped[pairSymbol].totals.total = add(grouped[pairSymbol].totals.total, total);
    grouped[pairSymbol].totals.totalDeposited = add(grouped[pairSymbol].totals.totalDeposited, balance.totalDeposited);
    grouped[pairSymbol].totals.totalAllocated = add(grouped[pairSymbol].totals.totalAllocated, balance.totalAllocated);
    grouped[pairSymbol].totals.totalWithdrawn = add(grouped[pairSymbol].totals.totalWithdrawn, balance.totalWithdrawn);
  }

  // Convert to human-readable using first balance's pair decimals
  const firstBalance = balances[0];
  const decimals = firstBalance?.pair?.decimals || 18;

  return formatGroupedBalances(grouped, decimals);
}

/**
 * Get total balance for a specific pair across all networks
 * Returns human-readable amounts
 */
export async function getTotalBalanceForPair(tradingAccountId, baseAsset) {
  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw createError({ statusCode: 404, message: `${baseAsset} not found` });
  }

  const wallets = await Wallet.find({ tradingAccount: tradingAccountId });
  const walletIds = wallets.map(w => w._id);

  const balances = await Balance.find({
    wallet: { $in: walletIds },
    pair: pair._id
  }).populate('pair');

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

  const decimals = pair.decimals || 18;
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

// ============================================
// BALANCE MODIFICATION FUNCTIONS
// ============================================

/**
 * Add initial balance (first deposit for a pair)
 * Input: human-readable amount, Output: human-readable result
 */
export async function addInitialBalance(
  tradingAccountId,
  baseAsset,
  amount, // human-readable (e.g., "10.5")
  targetNetwork
) {
  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw createError({ statusCode: 404, message: `${baseAsset} not found` });
  }

  const amountSmallest = toSmallestUnit(amount, pair.decimals);

  const wallets = await Wallet.find({ tradingAccount: tradingAccountId });
  const walletIds = wallets.map(w => w._id);

  const balance = await Balance.findOne({
    wallet: { $in: walletIds },
    pair: pair._id,
    network: targetNetwork
  });

  if (!balance) {
    throw new Error(`No balance found for network: ${targetNetwork}`);
  }

  balance.initial = add(balance.initial, amountSmallest);
  balance.available = add(balance.available, amountSmallest);
  balance.totalDeposited = add(balance.totalDeposited, amountSmallest);
  balance.lastDepositAt = new Date();

  await balance.save();

  return {
    network: targetNetwork,
    amount: toReadableUnit(amountSmallest, pair.decimals),
    balanceId: balance._id
  };
}

/**
 * Add deposit (subsequent deposits)
 * Input: human-readable amount, Output: human-readable result
 */
export async function addDeposit(
  tradingAccountId,
  baseAsset,
  amount, // human-readable
  targetNetwork
) {
  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw createError({ statusCode: 404, message: `${baseAsset} not found` });
  }

  const amountSmallest = toSmallestUnit(amount, pair.decimals);

  const wallets = await Wallet.find({ tradingAccount: tradingAccountId });
  const walletIds = wallets.map(w => w._id);

  const balance = await Balance.findOne({
    wallet: { $in: walletIds },
    pair: pair._id,
    network: targetNetwork
  });

  if (!balance) {
    throw new Error(`No balance found for network: ${targetNetwork}`);
  }

  balance.available = add(balance.available, amountSmallest);
  balance.totalDeposited = add(balance.totalDeposited, amountSmallest);
  balance.lastDepositAt = new Date();

  await balance.save();

  return {
    network: targetNetwork,
    amount: toReadableUnit(amountSmallest, pair.decimals),
    balanceId: balance._id
  };
}

/**
 * Remove withdrawal
 * Input: human-readable amount, Output: human-readable result
 */
export async function removeWithdrawal(
  tradingAccountId,
  baseAsset,
  amount, // human-readable
  sourceNetwork = null
) {
  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw createError({ statusCode: 404, message: `${baseAsset} not found` });
  }

  const amountSmallest = toSmallestUnit(amount, pair.decimals);

  const wallets = await Wallet.find({ tradingAccount: tradingAccountId });
  const walletIds = wallets.map(w => w._id);

  let balances = await Balance.find({
    wallet: { $in: walletIds },
    pair: pair._id
  }).sort({ available: -1 });

  // If source network specified, remove from that network only
  if (sourceNetwork) {
    const balance = balances.find(b => b.network === sourceNetwork);
    if (!balance) {
      throw new Error(`No balance found for network: ${sourceNetwork}`);
    }

    if (!isGreaterOrEqual(balance.available, amountSmallest)) {
      throw new Error(
        `Insufficient balance on ${sourceNetwork}. Available: ${toReadableUnit(balance.available, pair.decimals)}, Required: ${amount}`
      );
    }

    balance.available = subtract(balance.available, amountSmallest);
    balance.totalWithdrawn = add(balance.totalWithdrawn, amountSmallest);
    balance.lastWithdrawalAt = new Date();

    await balance.save();

    return {
      network: sourceNetwork,
      amount: toReadableUnit(amountSmallest, pair.decimals),
      balanceId: balance._id
    };
  }

  // Otherwise, remove from balances with highest availability
  let remaining = amountSmallest;
  const removed = [];

  for (const balance of balances) {
    if (compare(remaining, '0') <= 0) break;

    if (compare(balance.available, '0') <= 0) continue;

    const toRemove = min(balance.available, remaining);

    balance.available = subtract(balance.available, toRemove);
    balance.totalWithdrawn = add(balance.totalWithdrawn, toRemove);
    balance.lastWithdrawalAt = new Date();

    await balance.save();

    removed.push({
      balanceId: balance._id,
      network: balance.network,
      amount: toReadableUnit(toRemove, pair.decimals)
    });

    remaining = subtract(remaining, toRemove);
  }

  if (compare(remaining, '0') > 0) {
    throw new Error(
      `Insufficient balance. Required: ${amount}, Missing: ${toReadableUnit(remaining, pair.decimals)}`
    );
  }

  return { distributions: removed };
}

// ============================================
// ORDER-RELATED BALANCE OPERATIONS
// ============================================

/**
 * Lock balance for an order
 * Input: human-readable amount, Output: distributions in smallest units (for settlement)
 */
export async function lockBalanceForOrder(
  tradingAccountId,
  baseAsset,
  amount, // human-readable
  preferredNetwork = null
) {
  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw createError({ statusCode: 404, message: `${baseAsset} not found` });
  }

  const amountSmallest = toSmallestUnit(amount, pair.decimals);

  const wallets = await Wallet.find({ tradingAccount: tradingAccountId });
  const walletIds = wallets.map(w => w._id);

  let balances = await Balance.find({
    wallet: { $in: walletIds },
    pair: pair._id
  }).sort({ available: -1 });

  // Prefer specific network if specified
  if (preferredNetwork) {
    balances = balances.sort((a, b) => {
      if (a.network === preferredNetwork) return -1;
      if (b.network === preferredNetwork) return 1;
      return compare(b.available, a.available);
    });
  }

  let remaining = amountSmallest;
  const locked = [];

  // Lock from balances until we have enough
  for (const balance of balances) {
    if (compare(remaining, '0') <= 0) break;

    if (compare(balance.available, '0') <= 0) continue;

    const toLock = min(balance.available, remaining);

    balance.available = subtract(balance.available, toLock);
    balance.locked = add(balance.locked, toLock);

    await balance.save();

    locked.push({
      balanceId: balance._id,
      network: balance.network,
      amount: toLock // Keep in smallest units for settlement
    });

    remaining = subtract(remaining, toLock);
  }

  if (compare(remaining, '0') > 0) {
    // Rollback
    for (const item of locked) {
      const balance = await Balance.findById(item.balanceId);
      balance.available = add(balance.available, item.amount);
      balance.locked = subtract(balance.locked, item.amount);
      await balance.save();
    }

    throw new Error(
      `Insufficient balance. Required: ${amount}, Missing: ${toReadableUnit(remaining, pair.decimals)}`
    );
  }

  return {
    totalLocked: toReadableUnit(amountSmallest, pair.decimals),
    distributions: locked // Keep in smallest units for settlement
  };
}

/**
 * Unlock balance (when order is cancelled)
 * Input: distributions in smallest units from lockBalanceForOrder
 */
export async function unlockBalance(baseAsset, distributions) {
  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw createError({ statusCode: 404, message: `${baseAsset} not found` });
  }

  for (const dist of distributions) {
    const balance = await Balance.findById(dist.balanceId);
    if (!balance) continue;

    balance.locked = subtract(balance.locked, dist.amount);
    balance.available = add(balance.available, dist.amount);

    await balance.save();
  }

  return { success: true };
}