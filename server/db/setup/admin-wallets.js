import { model } from 'mongoose';
import { CHAIN_TYPES } from '../schemas/Network.js';

/**
 * HARDCODED: Admin user index for wallet generation
 * Use a special, fixed index to avoid collision with user wallets (User indexes are 6 digits)
 */
const ADMIN_WALLET_INDEX = 1111;

/**
 * Get initial pairs for admin balances
 * Same as user: USDT, ETH, and BTC
 */
const getInitialPairs = async () => {
    const Pair = model('Pair');
    return await Pair.find({
        baseAsset: {
            $in: ['USDT', 'ETH', 'BTC']
        }
    });
};

/**
 * Setup admin wallets
 * Creates 2 wallets (EVM + BTC) and 5 balances
 * Called during application initialization
 */
export const setupAdminWallets = async () => {
    console.log('==== Setting up admin wallets ====');

    const AdminWallet = model('AdminWallet');
    const AdminBalance = model('AdminBalance');

    try {
        // Check if admin wallets already exist
        const existingWallets = await AdminWallet.find();

        if (existingWallets.length > 0) {
            console.log('✅ Admin wallets already exist');
            return;
        }

        // 1. Create EVM wallet (handles Ethereum & Polygon)
        const evmData = generateEVMWallet(ADMIN_WALLET_INDEX, false); // false = not demo
        const evmWallet = await AdminWallet.create({
            ...evmData,
            label: 'EVM Treasury',
            description: 'Main treasury wallet for Ethereum and Polygon networks',
            isActive: true,
            lastScannedBlock: {}
        });
        console.log(`✅ Created EVM admin wallet: ${evmWallet.address}`);

        // 2. Create BTC wallet
        const btcData = generateBTCWallet(ADMIN_WALLET_INDEX, false); // false = not demo
        const btcWallet = await AdminWallet.create({
            ...btcData,
            label: 'BTC Treasury',
            description: 'Main treasury wallet for Bitcoin network',
            isActive: true,
            lastScannedBlock: {}
        });
        console.log(`✅ Created BTC admin wallet: ${btcWallet.address}`);

        // 3. Create balances for all pair-network combinations
        const initialPairs = await getInitialPairs();
        let balanceCount = 0;

        for (const pair of initialPairs) {
            const wallet = pair.chainType === CHAIN_TYPES.EVM ? evmWallet : btcWallet;

            for (const network of pair.networks) {
                await AdminBalance.create({
                    wallet: wallet._id,
                    pair: pair._id,
                    network,
                    available: '0',
                    locked: '0',
                    totalSweptIn: '0',
                    totalWithdrawnToUsers: '0',
                    totalWithdrawnToAdmin: '0'
                });
                balanceCount++;
            }
        }

        console.log(`✅ Created ${balanceCount} admin balances`);
        console.log(`✅ Admin wallet setup complete`);

    } catch (err) {
        if (err.code === 11000) {
            console.warn('⚠️ Duplicate admin wallet detected, skipping');
        } else {
            console.error('❌ Error setting up admin wallets:', err);
            throw err;
        }
    }
};

/**
 * Get admin wallets with balances
 */
export const getAdminWallets = async () => {
    const AdminWallet = model('AdminWallet');
    const AdminBalance = model('AdminBalance');

    const wallets = await AdminWallet.find({ isActive: true });

    const walletsWithBalances = await Promise.all(
        wallets.map(async (wallet) => {
            const balances = await AdminBalance.find({ wallet: wallet._id })
                .populate('pair');

            return {
                ...wallet.toObject(),
                balances
            };
        })
    );

    return walletsWithBalances;
};