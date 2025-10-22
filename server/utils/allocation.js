
/**
 * Create a new asset allocation for a user
 */
export async function createAllocation(userId, tradingAccountId, pairId, amount) {
    const AssetAllocation = getModel('AssetAllocation');
    
    // Check if user already has an active allocation
    const existingAllocation = await AssetAllocation.findOne({
        user: userId,
        status: 'active'
    });
    
    if (existingAllocation) {
        throw new Error('User already has an active allocation');
    }
    
    // Create allocation with 24-hour expiry
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const allocation = await AssetAllocation.create({
        user: userId,
        tradingAccount: tradingAccountId,
        pairId,
        amount,
        expiresAt,
        status: 'active'
    });
    
    return allocation;
}

/**
 * Add allocated funds to trading account balance
 */
export async function addAllocationToAccount(tradingAccountId, amount) {
    const TradingAccount = getModel('TradingAccount');
    
    const account = await TradingAccount.findById(tradingAccountId);
    if (!account) {
        throw new Error('Trading account not found');
    }
    
    // Update account balances
    account.balance += amount;
    account.freeMargin += amount;
    account.equity += amount;
    
    await account.save();
    
    return account;
}

/**
 * Remove allocated funds from trading account
 */
export async function removeAllocationFromAccount(tradingAccountId, amount) {
    const TradingAccount = getModel('TradingAccount');
    
    const account = await TradingAccount.findById(tradingAccountId);
    if (!account) {
        throw new Error('Trading account not found');
    }
    
    // Update account balances
    account.balance -= amount;
    account.freeMargin -= amount;
    account.equity -= amount;
    
    // Ensure balances don't go negative
    if (account.balance < 0) account.balance = 0;
    if (account.freeMargin < 0) account.freeMargin = 0;
    if (account.equity < 0) account.equity = 0;
    
    await account.save();
    
    return account;
}

/**
 * Withdraw expired allocation
 */
export async function withdrawAllocation(allocationId) {
    const AssetAllocation = getModel('AssetAllocation');
    const TradingAccount = getModel('TradingAccount');
    
    const allocation = await AssetAllocation.findById(allocationId);
    if (!allocation) {
        throw new Error('Allocation not found');
    }
    
    if (allocation.status !== 'active') {
        throw new Error('Allocation is not active');
    }
    
    // Get account balance before withdrawal
    const accountBefore = await TradingAccount.findById(allocation.tradingAccount);
    const balanceBefore = accountBefore.balance;
    
    // Remove allocated funds
    await removeAllocationFromAccount(allocation.tradingAccount, allocation.amount);
    
    // Get account balance after withdrawal
    const accountAfter = await TradingAccount.findById(allocation.tradingAccount);
    const balanceAfter = accountAfter.balance;
    
    // Calculate profit during allocation period
    const profitDuringPeriod = balanceAfter - (balanceBefore - allocation.amount);
    
    // Update allocation status
    allocation.status = 'withdrawn';
    allocation.withdrawnAt = new Date();
    allocation.profitDuringPeriod = profitDuringPeriod;
    await allocation.save();
    
    return allocation;
}

/**
 * Get active allocation for a user
 */
export async function getActiveAllocation(userId) {
    const AssetAllocation = getModel('AssetAllocation');
    
    const allocation = await AssetAllocation.findOne({
        user: userId,
        status: 'active'
    }).populate('pairId', 'symbol name');
    
    return allocation;
}

/**
 * Get allocation history for a user
 */
export async function getAllocationHistory(userId, limit = 10) {
    const AssetAllocation = getModel('AssetAllocation');
    
    const allocations = await AssetAllocation.find({
        user: userId,
        status: { $in: ['withdrawn', 'expired'] }
    })
    .populate('pairId', 'symbol name')
    .sort({ createdAt: -1 })
    .limit(limit);
    
    return allocations;
}

/**
 * Process expired allocations (called by cron job)
 */
export async function processExpiredAllocations() {
    const AssetAllocation = getModel('AssetAllocation');
    
    // Find all active allocations that have expired
    const expiredAllocations = await AssetAllocation.find({
        status: 'active',
        expiresAt: { $lte: new Date() }
    });
    
    console.log(`[CRON] Found ${expiredAllocations.length} expired allocations to process`);
    
    const results = {
        success: [],
        failed: []
    };
    
    for (const allocation of expiredAllocations) {
        try {
            await withdrawAllocation(allocation._id);
            results.success.push(allocation._id);
            console.log(`[CRON] Successfully withdrew allocation ${allocation._id}`);
        } catch (error) {
            results.failed.push({ 
                allocationId: allocation._id, 
                error: error.message 
            });
            console.error(`[CRON] Failed to withdraw allocation ${allocation._id}:`, error);
        }
    }
    
    return results;
}