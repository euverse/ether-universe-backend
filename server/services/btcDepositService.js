import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';
import { CHAIN_TYPES, NETWORKS } from '~/db/schemas/Network.js';
import { DEPOSIT_STATUS } from '~/db/schemas/Deposit.js';

const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

const Pair = getModel('Pair');
const Wallet = getModel('Wallet');
const Balance = getModel('Balance');
const Deposit = getModel('Deposit');
const AdminWallet = getModel('AdminWallet');

const rpcUrls = useRuntimeConfig().rpcUrls;

// Bitcoin API endpoint
const BTC_API_URL = rpcUrls.BITCOIN_RPC_URL || 'https://blockstream.info/api';

// Minimum balance threshold
const MIN_BTC_THRESHOLD = '0.0001'; // 10,000 satoshis

// Bitcoin network configuration
const BITCOIN_NETWORK = bitcoin.networks.bitcoin;

/**
 * Get Bitcoin address balance
 */
async function getBitcoinBalance(address) {
    try {
        const response = await $fetch(`${BTC_API_URL}/address/${address}`, {
            timeout: 10000
        });

        // Get confirmed balance in satoshis
        const balanceSat = response.chain_stats?.funded_txo_sum - response.chain_stats?.spent_txo_sum || 0;

        // Convert to BTC
        return (balanceSat / 1e8).toString();

    } catch (error) {
        console.error(`[getBitcoinBalance] Error fetching balance for ${address}:`, error.message);
        throw error;
    }
}

/**
 * Get UTXOs for an address
 */
async function getUTXOs(address) {
    try {
        const utxos = await $fetch(`${BTC_API_URL}/address/${address}/utxo`, {
            timeout: 10000
        });

        return utxos;

    } catch (error) {
        console.error(`[getUTXOs] Error fetching UTXOs for ${address}:`, error.message);
        throw error;
    }
}

/**
 * Estimate transaction fee
 */
async function estimateFee() {
    try {
        const feeEstimates = await $fetch(`${BTC_API_URL}/fee-estimates`, {
            timeout: 10000
        });

        // Use the fee for next block (fastest confirmation)
        // Returns sat/vB
        return Math.ceil(feeEstimates['1'] || 1);

    } catch (error) {
        console.error(`[estimateFee] Error:`, error.message);
        // Default to 1 sat/vB if estimation fails
        return 1;
    }
}

/**
 * Broadcast Bitcoin transaction
 */
async function broadcastTransaction(txHex) {
    try {
        const txid = await $fetch(`${BTC_API_URL}/tx`, {
            method: 'POST',
            body: txHex,
            timeout: 10000
        });

        return txid;

    } catch (error) {
        console.error(`[broadcastTransaction] Error:`, error.message);
        throw error;
    }
}

/**
 * Calculate total pending deposit amount
 */
async function getPendingDepositAmount(walletId, pairId, network) {
    const pendingDeposits = await Deposit.find({
        wallet: walletId,
        pair: pairId,
        network,
        status: DEPOSIT_STATUS.PENDING
    });

    let total = '0';
    for (const deposit of pendingDeposits) {
        total = add(total, deposit.amountSmallest);
    }

    return total;
}

/**
 * Scan a single Bitcoin wallet for deposits
 */
export async function scanBitcoinWalletForDeposits(wallet) {
    const deposits = [];

    try {
        // Get BTC pair
        const btcPair = await Pair.findOne({
            symbol: 'BTC',
            chainType: CHAIN_TYPES.BITCOIN,
            isActive: true
        });

        if (!btcPair) {
            console.warn('[scanBitcoinWalletForDeposits] BTC pair not found');
            return deposits;
        }

        // Get on-chain balance
        const onchainBalance = await getBitcoinBalance(wallet.address);

        // Check minimum threshold
        if (parseFloat(onchainBalance) < parseFloat(MIN_BTC_THRESHOLD)) {
            return deposits;
        }

        // Get or create balance record
        const balance = await Balance.findOneAndUpdate(
            {
                wallet: wallet._id,
                pair: btcPair._id,
                network: NETWORKS.BITCOIN
            },
            {
                $setOnInsert: {
                    initial: '0',
                    available: '0',
                    locked: '0',
                    totalDeposited: '0',
                    totalAllocated: '0'
                }
            },
            {
                upsert: true,
                new: true
            }
        );

        // Calculate pending amount
        const pendingAmountSmallest = await getPendingDepositAmount(
            wallet._id,
            btcPair._id,
            NETWORKS.BITCOIN
        );

        // Convert on-chain balance to satoshis
        const onchainBalanceSmallest = toSmallestUnit(onchainBalance, 8);

        // Calculate new deposit amount
        const newDepositAmountSmallest = subtract(
            onchainBalanceSmallest,
            pendingAmountSmallest
        );

        // Check if there's a new deposit
        if (compare(newDepositAmountSmallest, '0') <= 0) {
            return deposits;
        }

        // Convert to BTC
        const newDepositAmount = toReadableUnit(newDepositAmountSmallest, 8);

        // Create deposit record
        const deposit = await Deposit.create({
            tradingAccount: wallet.tradingAccount,
            wallet: wallet._id,
            balance: balance._id,
            network: NETWORKS.BITCOIN,
            pair: btcPair._id,
            amount: newDepositAmount,
            amountSmallest: newDepositAmountSmallest,
            status: DEPOSIT_STATUS.PENDING,
            detectedAt: new Date()
        });

        deposits.push(deposit);

        console.log(`[scanBitcoinWalletForDeposits] New deposit detected: ${newDepositAmount} BTC`);

    } catch (error) {
        console.error(`[scanBitcoinWalletForDeposits] Error scanning wallet ${wallet._id}:`, error);
    }

    return deposits;
}

/**
 * Scan all Bitcoin wallets for deposits
 */
export async function scanAllBitcoinWalletsForDeposits() {
    try {
        // Get all Bitcoin wallets
        const wallets = await Wallet.find({
            chainType: CHAIN_TYPES.BITCOIN
        });

        const results = {
            scanned: 0,
            found: 0,
            deposits: []
        };

        for (const wallet of wallets) {
            const deposits = await scanBitcoinWalletForDeposits(wallet);

            results.found += deposits.length;
            results.deposits.push(...deposits);
            results.scanned++;
        }

        return results;

    } catch (error) {
        console.error('[scanAllBitcoinWalletsForDeposits] Error:', error);
        return { scanned: 0, found: 0, deposits: [] };
    }
}

/**
 * Sweep pending Bitcoin deposits to admin wallet
 */
export async function sweepPendingBitcoinDeposits() {
    try {
        // Get pending deposits ready to be swept
        const depositsToSweep = await Deposit.find({
            network: NETWORKS.BITCOIN,
            status: DEPOSIT_STATUS.PENDING
        }).populate('wallet pair balance');

        const results = {
            swept: 0,
            failed: 0,
            details: []
        };

        for (const deposit of depositsToSweep) {
            try {
                await sweepSingleBitcoinDeposit(deposit);
                results.swept++;
                results.details.push({
                    depositId: deposit._id,
                    amount: deposit.amount,
                    pair: deposit.pair.symbol,
                    network: deposit.network,
                    status: 'success'
                });
            } catch (error) {
                results.failed++;
                results.details.push({
                    depositId: deposit._id,
                    amount: deposit.amount,
                    pair: deposit.pair.symbol,
                    network: deposit.network,
                    status: 'failed',
                    error: error.message
                });
                console.error(`[sweepPendingBitcoinDeposits] Failed to sweep deposit ${deposit._id}:`, error);
            }
        }

        return results;

    } catch (error) {
        console.error('[sweepPendingBitcoinDeposits] Error:', error);
        return { swept: 0, failed: 0, details: [] };
    }
}

/**
 * Sweep a single Bitcoin deposit from user wallet to admin wallet
 */
async function sweepSingleBitcoinDeposit(deposit) {
    const wallet = deposit.wallet;
    const pair = deposit.pair;

    // Get admin wallet for Bitcoin
    const adminWallet = await AdminWallet.findOne({
        chainType: CHAIN_TYPES.BITCOIN,
        isActive: true
    }).select('+derivationPath');

    if (!adminWallet) {
        throw new Error('No active Bitcoin admin wallet found');
    }

    // Get UTXOs for user wallet
    const utxos = await getUTXOs(wallet.address);

    if (!utxos || utxos.length === 0) {
        throw new Error('No UTXOs found for wallet');
    }

    // Create transaction
    const psbt = new bitcoin.Psbt({ network: BITCOIN_NETWORK });

    // Add inputs from UTXOs
    let totalInput = 0;
    for (const utxo of utxos) {
        psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            witnessUtxo: {
                script: bitcoin.address.toOutputScript(wallet.address, BITCOIN_NETWORK),
                value: utxo.value
            }
        });
        totalInput += utxo.value;
    }

    // Estimate fee (1 input + 1 output = ~140 vBytes for P2WPKH)
    const feeRate = await estimateFee();
    const estimatedSize = utxos.length * 68 + 34 + 10; // More accurate estimation
    const fee = feeRate * estimatedSize;

    // Calculate amount to send (total - fee)
    const amountToSend = totalInput - fee;

    if (amountToSend <= 0) {
        throw new Error('Insufficient balance to cover transaction fees');
    }

    // Add output to admin wallet
    psbt.addOutput({
        address: adminWallet.address,
        value: amountToSend
    });

    // Sign transaction with user wallet's private key
    const mnemonic = process.env.MASTER_MNEMONIC;
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, BITCOIN_NETWORK);
    const child = root.derivePath(wallet.derivationPath);
    const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: BITCOIN_NETWORK });

    // Sign all inputs
    for (let i = 0; i < utxos.length; i++) {
        psbt.signInput(i, keyPair);
    }

    // Finalize and extract transaction
    psbt.finalizeAllInputs();
    const txHex = psbt.extractTransaction().toHex();

    // Broadcast transaction
    const txHash = await broadcastTransaction(txHex);

    await addDeposit(
        deposit.tradingAccount,
        pair.baseAsset,
        deposit.amount,
        NETWORKS.BITCOIN
    );

    // Update admin balance using utility
    await addAdminBalance(
        pair.baseAsset,
        deposit.amount,
        NETWORKS.BITCOIN
    );

    // Mark deposit as swept
    deposit.status = DEPOSIT_STATUS.SWEPT;
    deposit.sweptAt = new Date();
    deposit.sweepTxHash = txHash;
    deposit.sweptToAdminWallet = adminWallet._id;
    await deposit.save();

    console.log(`[sweepSingleBitcoinDeposit] Swept ${deposit.amount} ${pair.symbol} to admin wallet. TX: ${txHash}`);
}