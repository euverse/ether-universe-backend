import { model } from 'mongoose';
import { removeWithdrawal } from './balanceUtils.js';
import { deductAdminBalance, lockAdminBalance, unlockAdminBalance, finalizeLockedAdminBalance } from './adminBalanceUtils.js';

const TradingAccount = model('TradingAccount');

// ============================================
// USER WITHDRAWAL (to external wallet)
// ============================================

/**
 * Process user withdrawal
 * 1. Deducts from user balance
 * 2. Deducts from admin balance (since admin must send funds)
 * 
 * @param {string} tradingAccountId - User's trading account ID
 * @param {string} baseAsset - Asset symbol
 * @param {string} amount - Human-readable amount
 * @param {string} destinationAddress - User's external wallet address
 * @param {string} network - Network to withdraw from
 * @returns {Object} Withdrawal transaction details
 */
export async function processUserWithdrawal(
  tradingAccountId,
  baseAsset,
  amount,
  destinationAddress,
  network
) {
  // Validate trading account exists
  const account = await TradingAccount.findById(tradingAccountId);
  if (!account) {
    throw new Error('Trading account not found');
  }

  try {
    // Step 1: Remove from user balance
    const userDeduction = await removeWithdrawal(
      tradingAccountId,
      baseAsset,
      amount,
      network
    );

    // Step 2: Deduct from admin balance (admin must send the funds)
    const adminDeduction = await deductAdminBalance(
      baseAsset,
      amount,
      'user', // withdrawal type
      network
    );

    return {
      success: true,
      transactionType: 'user_withdrawal',
      baseAsset,
      amount,
      network,
      destinationAddress,
      user: {
        tradingAccountId,
        deduction: userDeduction
      },
      admin: {
        deduction: adminDeduction
      },
      timestamp: new Date()
    };

  } catch (error) {
    // If admin deduction fails after user deduction, we should rollback
    // In production, implement proper transaction rollback mechanism
    throw new Error(`Withdrawal failed: ${error.message}`);
  }
}

/**
 * Process user withdrawal with pending state
 * Uses lock/unlock mechanism for better error handling
 * 
 * @param {string} tradingAccountId - User's trading account ID
 * @param {string} baseAsset - Asset symbol
 * @param {string} amount - Human-readable amount
 * @param {string} destinationAddress - User's external wallet address
 * @param {string} network - Network to withdraw from
 * @returns {Object} Pending withdrawal details with lock info
 */
export async function initiateUserWithdrawal(
  tradingAccountId,
  baseAsset,
  amount,
  destinationAddress,
  network
) {
  // Validate trading account exists
  const account = await TradingAccount.findById(tradingAccountId);
  if (!account) {
    throw new Error('Trading account not found');
  }

  try {
    // Step 1: Lock user balance
    const userLock = await lockBalanceForOrder(
      tradingAccountId,
      baseAsset,
      amount,
      network
    );

    // Step 2: Lock admin balance
    const adminLock = await lockAdminBalance(
      baseAsset,
      amount,
      network
    );

    return {
      withdrawalId: `withdrawal_${Date.now()}`,
      status: 'pending',
      transactionType: 'user_withdrawal',
      baseAsset,
      amount,
      network,
      destinationAddress,
      user: {
        tradingAccountId,
        lock: userLock
      },
      admin: {
        lock: adminLock
      },
      createdAt: new Date()
    };

  } catch (error) {
    throw new Error(`Failed to initiate withdrawal: ${error.message}`);
  }
}

/**
 * Confirm user withdrawal (after blockchain confirmation)
 * Finalizes the locked balancesO
 * **/