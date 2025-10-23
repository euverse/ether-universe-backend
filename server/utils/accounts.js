import { CHAIN_TYPES, NETWORKS } from '../db/schemas/Network.js';
import { ACCOUNT_TYPES } from '../db/schemas/TradingAccount.js';

const Pair = getModel('Pair');
const TradingAccount = getModel('TradingAccount');
const Wallet = getModel('Wallet');
const Balance = getModel('Balance');

/**
 * HARDCODED: Initial pairs configuration
 * 3 pairs: USDT, ETH, and BTC
 */
const getInitialPairs = async () => {
    return await Pair.find({
        baseAsset: {
            $in: ['USDT', 'ETH', 'BTC']
        }
    });
};

/**
 * Initialize trading account with wallets and balances
 * This is the main function called when:
 * 1. New user signs up (creates DEMO account)
 * 2. User completes KYC (creates REAL account)
 */
export async function initializeTradingAccount(
    userId,
    accountType
) {
    const isDemo = accountType === ACCOUNT_TYPES.DEMO;

    const User = getModel('User');
    const user = await User.findOne({ id: userId }).select('_id');

    if (!user) {
        throw new Error('User not found');
    }

    // 1. Create trading account
    const account = await TradingAccount.create({
        user: user._id,
        type: accountType,
        isActive: true
    });

    // 2. Create wallets (1 EVM + 1 BTC)
    const wallets = await createWallets(account._id, userId, isDemo);

    // 3. Create balances for all pair-network combinations
    await createBalances(wallets, account._id, isDemo);

    const initialPairs = await getInitialPairs();

    return {
        account,
        wallets,
        message: `${accountType} account initialized with ${wallets.length} wallets and ${initialPairs.length} pairs`
    };
}

/**
 * Create wallets for trading account
 * HARDCODED: 1 EVM wallet + 1 BTC wallet
 */
async function createWallets(accountId, userId, isDemo) {
    const wallets = [];

    // Create EVM wallet (handles Ethereum & Polygon)
    const evmData = generateEVMWallet(userId, isDemo);
    const evmWallet = await Wallet.create({
        tradingAccount: accountId,
        ...evmData,
        lastScannedBlock: {}
    });
    wallets.push(evmWallet);

    // Create BTC wallet
    const btcData = generateBTCWallet(userId, isDemo);
    const btcWallet = await Wallet.create({
        tradingAccount: accountId,
        ...btcData,
        lastScannedBlock: {}
    });
    wallets.push(btcWallet);

    return wallets;
}

/**
 * Create balances for all pair-network combinations
 * HARDCODED: 5 balances total:
 * - USDT on Ethereum
 * - USDT on Polygon
 * - ETH on Ethereum
 * - ETH on Polygon
 * - BTC on Bitcoin
 * 
 * Now uses proper balance utilities for demo account initialization
 */
async function createBalances(wallets, accountId, isDemo) {
    // Get EVM and BTC wallets
    const evmWallet = wallets.find(w => w.chainType === CHAIN_TYPES.EVM);
    const btcWallet = wallets.find(w => w.chainType === CHAIN_TYPES.BTC);

    const initialPairs = await getInitialPairs();

    // Create empty balances for each pair on its networks
    for (const pair of initialPairs) {
        const wallet = pair.chainType === CHAIN_TYPES.EVM ? evmWallet : btcWallet;

        for (const network of pair.networks) {
            // Create balance record with all fields set to '0' (in smallest units)
            await Balance.create({
                wallet: wallet._id,
                pair: pair._id,
                network,
                initial: '0',
                available: '0',
                locked: '0',
                totalDeposited: '0',
                totalAllocated: '0',
                totalWithdrawn: '0'
            });
        }
    }
}

/**
 * Get trading account with all wallets and balances
 * Returns balances in human-readable format
 */
export async function getTradingAccountDetails(accountId) {
    const account = await TradingAccount.findById(accountId);
    if (!account) {
        throw new Error('Trading account not found');
    }

    const wallets = await Wallet.find({ tradingAccount: accountId });

    const balances = await Balance.find({
        wallet: { $in: wallets.map(w => w._id) }
    }).populate('pair');

    // Format balances to human-readable
    const formattedBalances = balances.map(balance => {
        const decimals = balance.pair?.decimals || 18;

        return {
            _id: balance._id,
            wallet: balance.wallet,
            pair: {
                _id: balance.pair._id,
                symbol: balance.pair.symbol,
                baseAsset: balance.pair.baseAsset,
                decimals: balance.pair.decimals
            },
            network: balance.network,
            initial: toReadableUnit(balance.initial, decimals),
            available: toReadableUnit(balance.available, decimals),
            locked: toReadableUnit(balance.locked, decimals),
            total: toReadableUnit(
                add(balance.available, balance.locked),
                decimals
            ),
            totalDeposited: toReadableUnit(balance.totalDeposited, decimals),
            totalAllocated: toReadableUnit(balance.totalAllocated, decimals),
            totalWithdrawn: toReadableUnit(balance.totalWithdrawn, decimals),
            lastDepositAt: balance.lastDepositAt,
            lastWithdrawalAt: balance.lastWithdrawalAt,
            createdAt: balance.createdAt,
            updatedAt: balance.updatedAt
        };
    });

    return {
        account,
        wallets,
        balances: formattedBalances
    };
}

/**
 * Get trading account summary (totals per pair)
 * Returns human-readable balances grouped by pair
 */
export async function getTradingAccountSummary(accountId) {
    const account = await TradingAccount.findById(accountId);
    if (!account) {
        throw new Error('Trading account not found');
    }

    // Use the balance utility function
    const balancesByPair = await getBalancesByPair(accountId);

    return {
        account: {
            _id: account._id,
            type: account.type,
            isActive: account.isActive,
            leverage: account.leverage
        },
        balances: balancesByPair
    };
}

/**
 * Check if user has a specific account type
 */
export async function hasAccountType(userId, accountType) {
    const User = getModel('User');
    const user = await User.findOne({ id: userId }).select('_id');

    if (!user) {
        return false;
    }

    const account = await TradingAccount.findOne({
        user: user._id,
        type: accountType
    });

    return !!account;
}

/**
 * Get all trading accounts for a user
 */
export async function getUserTradingAccounts(userId) {
    const User = getModel('User');
    const user = await User.findOne({ id: userId }).select('_id');

    if (!user) {
        throw new Error('User not found');
    }

    const accounts = await TradingAccount.find({ user: user._id });

    // Get summary for each account
    const accountsWithBalances = await Promise.all(
        accounts.map(async (account) => {
            const balances = await getBalancesByPair(account._id, {
                includeZeroBalances: false
            });

            // Calculate total portfolio value (assuming all in USDT equivalent)
            let totalValue = 0;
            for (const [symbol, data] of Object.entries(balances)) {
                const total = parseFloat(data.totals.total);
                const pair = data.pair;

                // Convert to USDT value
                if (pair.baseAsset === 'USDT') {
                    totalValue += total;
                } else {
                    totalValue += total * (pair.valueUsd || 0);
                }
            }

            return {
                _id: account._id,
                type: account.type,
                isActive: account.isActive,
                leverage: account.leverage,
                totalValueUsd: parseFloat(totalValue.toFixed(2)),
                balances,
                createdAt: account.createdAt
            };
        })
    );

    return accountsWithBalances;
}

/**
 * Activate/Deactivate trading account
 */
export async function setAccountStatus(accountId, isActive) {
    const account = await TradingAccount.findById(accountId);
    if (!account) {
        throw new Error('Trading account not found');
    }

    account.isActive = isActive;
    await account.save();

    return account;
}

/**
 * Delete trading account (soft delete - deactivate)
 * Only allow if no open orders
 */
export async function deleteTradingAccount(accountId) {
    const account = await TradingAccount.findById(accountId);
    if (!account) {
        throw new Error('Trading account not found');
    }

    // Check for open orders
    const openOrders = await getOpenOrders(accountId);
    if (openOrders.length > 0) {
        throw new Error('Cannot delete account with open orders. Please close all orders first.');
    }

    // Deactivate instead of deleting
    account.isActive = false;
    await account.save();

    return {
        success: true,
        message: 'Trading account deactivated'
    };
}