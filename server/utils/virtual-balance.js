import { model } from 'mongoose';

/**
 * Allocate virtual balance to user after deposit confirmation
 */
export async function allocateVirtualBalance(depositId) {
    try {
        const Deposit = model('Deposit');
        const Balance = model('Balance');
        const TradingPair = model('TradingPair');

        const deposit = await Deposit.findById(depositId)
            .populate('wallet')
            .populate('tradingPair');

        if (!deposit) {
            throw new Error('Deposit not found');
        }

        if (deposit.virtualBalanceAllocated) {
            console.log(`[allocateVirtualBalance] Already allocated: ${depositId}`);
            return { success: false, message: 'Already allocated' };
        }

        // Get USDT trading pair for conversion
        const usdtPair = await TradingPair.findOne({ baseAsset: 'USDT' });
        
        if (!usdtPair) {
            throw new Error('USDT trading pair not found');
        }

        // Calculate virtual balance amount
        const depositAmount = parseFloat(deposit.amount);
        const depositPairPrice = parseFloat(deposit.tradingPair.valueUsd);
        const amountUsd = depositAmount * depositPairPrice;
        
        // Apply allocation ratio (default 1:1)
        const virtualAmount = (amountUsd * deposit.allocationRatio).toFixed(2);

        // Find or create USDT balance for this wallet
        let balance = await Balance.findOne({
            wallet: deposit.wallet._id,
            tradingPair: usdtPair._id
        });

        if (!balance) {
            // Create new balance if doesn't exist
            balance = await Balance.create({
                wallet: deposit.wallet._id,
                tradingPair: usdtPair._id,
                realBalance: deposit.amount,
                virtualBalance: virtualAmount,
                total: virtualAmount,
                totalDeposited: deposit.amount,
                lastDepositAt: new Date()
            });
        } else {
            // Update existing balance
            const newVirtualBalance = (
                parseFloat(balance.virtualBalance) + parseFloat(virtualAmount)
            ).toFixed(2);
            
            const newTotalDeposited = (
                parseFloat(balance.totalDeposited) + depositAmount
            ).toFixed(6);

            balance.virtualBalance = newVirtualBalance;
            balance.total = newVirtualBalance;
            balance.totalDeposited = newTotalDeposited;
            balance.lastDepositAt = new Date();
            
            await balance.save();
        }

        // Mark deposit as allocated
        deposit.virtualBalanceAllocated = true;
        deposit.allocatedAmount = virtualAmount;
        deposit.allocatedAt = new Date();
        deposit.status = 'allocated';
        deposit.amountUsd = amountUsd.toFixed(2);
        
        await deposit.save();

        console.log(`[allocateVirtualBalance] Success: ${depositId} | Amount: $${virtualAmount}`);

        return {
            success: true,
            depositId: deposit.depositId,
            allocatedAmount: virtualAmount,
            balance: {
                virtualBalance: balance.virtualBalance,
                realBalance: balance.realBalance
            }
        };

    } catch (error) {
        console.error('[allocateVirtualBalance] Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Deduct virtual balance for withdrawal
 */
export async function deductVirtualBalance(withdrawalId) {
    try {
        const Withdrawal = model('Withdrawal');
        const Balance = model('Balance');

        const withdrawal = await Withdrawal.findById(withdrawalId)
            .populate('wallet')
            .populate('tradingPair');

        if (!withdrawal) {
            throw new Error('Withdrawal not found');
        }

        // Find balance
        const balance = await Balance.findOne({
            wallet: withdrawal.wallet._id,
            tradingPair: withdrawal.tradingPair._id
        });

        if (!balance) {
            throw new Error('Balance not found');
        }

        const currentVirtual = parseFloat(balance.virtualBalance);
        const withdrawAmount = parseFloat(withdrawal.netAmount);

        if (currentVirtual < withdrawAmount) {
            throw new Error('Insufficient virtual balance');
        }

        // Deduct balance
        balance.virtualBalance = (currentVirtual - withdrawAmount).toFixed(2);
        balance.total = balance.virtualBalance;
        balance.totalWithdrawn = (
            parseFloat(balance.totalWithdrawn || '0') + withdrawAmount
        ).toFixed(2);
        balance.lastWithdrawalAt = new Date();

        await balance.save();

        console.log(`[deductVirtualBalance] Success: ${withdrawalId} | Deducted: ${withdrawAmount}`);

        return {
            success: true,
            withdrawalId: withdrawal.withdrawalId,
            deductedAmount: withdrawAmount,
            remainingBalance: balance.virtualBalance
        };

    } catch (error) {
        console.error('[deductVirtualBalance] Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get total virtual balance in USD
 */
export async function getTotalVirtualBalanceUsd(userId) {
    try {
        const TradingAccount = model('TradingAccount');
        const Wallet = model('Wallet');
        const Balance = model('Balance');

        const accounts = await TradingAccount.find({ user: userId });
        const accountIds = accounts.map(acc => acc._id);

        const wallets = await Wallet.find({ tradingAccount: { $in: accountIds } });
        const walletIds = wallets.map(w => w._id);

        const balances = await Balance.find({ wallet: { $in: walletIds } })
            .populate('tradingPair');

        let totalUsd = 0;

        for (const balance of balances) {
            const virtualBalance = parseFloat(balance.virtualBalance || '0');
            const price = parseFloat(balance.tradingPair?.valueUsd || '0');
            totalUsd += virtualBalance * price;
        }

        return totalUsd.toFixed(2);

    } catch (error) {
        console.error('[getTotalVirtualBalanceUsd] Error:', error);
        return '0.00';
    }
}