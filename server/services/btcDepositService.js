import { CHAIN_TYPES, NETWORKS } from '~/db/schemas/Network.js';
import { DEPOSIT_STATUS } from '~/db/schemas/Deposit.js';
import { btcDepositScanLogger, btcSweepLogger } from './logService';

const Pair = getModel('Pair');
const Wallet = getModel('Wallet');
const Balance = getModel('Balance');
const Deposit = getModel('Deposit');
const AdminWallet = getModel('AdminWallet');

const rpcUrls = useRuntimeConfig().rpcUrls;

// Bitcoin API endpoint
const BTC_API_URL = rpcUrls.btc;

// Minimum balance threshold
const MIN_BTC_THRESHOLD = '0.0001'; // 10,000 satoshis

// Minimum confirmations required for UTXOs (0 = unconfirmed accepted)
const MIN_CONFIRMATIONS = 0;

const logger = btcDepositScanLogger || console;

/**
 * Calculate total pending deposit amount
 */
async function getPendingDepositAmount(walletId, pairId, network) {
    const pendingDeposits = await Deposit.find({
        wallet: walletId,
        pair: pairId,
        network,
        status: { $in: [DEPOSIT_STATUS.PENDING, DEPOSIT_STATUS.PROCESSING] }
    });

    const total = pendingDeposits.reduce((sum, deposit) => add(sum, deposit.amountSmallest), '0');

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
            baseAsset: 'BTC',
            chainType: CHAIN_TYPES.BTC,
            isActive: true
        });

        if (!btcPair) {
            logger.warn('BTC pair not found');
            return deposits;
        }

        // Get on-chain balance
        const onchainBalance = await getBitcoinBalanceBTC(BTC_API_URL, wallet.address);

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

        // Calculate pending amount (including PROCESSING status)
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
        });

        deposits.push(deposit);

        logger.log(`New deposit detected: ${newDepositAmount} BTC`);

    } catch (error) {
        logger.error(`Error scanning wallet ${wallet._id}: ${error}`);
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
            chainType: CHAIN_TYPES.BTC,
            derivationPath: { $ne: null } //select only active wallets
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

        logger.log(`Completed: ${results.scanned} scans, ${results.found} deposits found`);

        return results;

    } catch (error) {
        logger.error(`Error: ${error.message}`);
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
            // Validate populated fields
            if (!deposit.wallet || !deposit.pair || !deposit.balance) {
                logger.error(`Invalid deposit ${deposit._id}: missing populated fields`);
                results.failed++;
                continue;
            }

            // Validate amountSmallest exists
            if (!deposit.amountSmallest || compare(deposit.amountSmallest, '0') <= 0) {
                logger.error(`Invalid deposit ${deposit._id}: invalid amountSmallest`);
                results.failed++;
                continue;
            }

            try {
                // Prevent concurrent sweeps - mark as PROCESSING
                const updated = await Deposit.findOneAndUpdate(
                    { _id: deposit._id, status: DEPOSIT_STATUS.PENDING },
                    { $set: { status: DEPOSIT_STATUS.PROCESSING } },
                    { new: true }
                )
                    .populate('wallet')
                    .exec();

                if (!updated) {
                    logger.log(`Deposit ${deposit._id} already being processed`);
                    continue;
                }

                await sweepSingleBitcoinDeposit(updated);
                results.swept++;
                results.details.push({
                    depositId: deposit._id,
                    amount: deposit.amount,
                    pair: deposit.pair.symbol,
                    network: deposit.network,
                    status: 'success'
                });
            } catch (error) {
                // Mark as FAILED for retry later
                await Deposit.findByIdAndUpdate(deposit._id, {
                    status: DEPOSIT_STATUS.FAILED,
                    failureReason: error.message,
                    failedAt: new Date()
                });

                results.failed++;
                results.details.push({
                    depositId: deposit._id,
                    amount: deposit.amount,
                    pair: deposit.pair.symbol,
                    network: deposit.network,
                    status: 'failed',
                    error: error.message
                });
                logger.error(`Failed to sweep deposit ${deposit._id}: ${error.message}`);
            }
        }

        logger.log(`Completed: ${results.swept} swept, ${results.failed} failed`);

        return results;

    } catch (error) {
        logger.error(`Error: ${error.message}`);
        return { swept: 0, failed: 0, details: [] };
    }
}

/**
 * Retry failed Bitcoin deposits
 */
export async function retryFailedBitcoinDeposits() {
    try {
        // Get failed deposits that haven't been retried too many times
        const failedDeposits = await Deposit.find({
            network: NETWORKS.BITCOIN,
            status: DEPOSIT_STATUS.FAILED,
            retryCount: { $lt: 3 }, // Max 3 retries
            failedAt: { $lt: new Date(Date.now() - 300000) } // Failed at least 5 minutes ago
        }).populate('wallet pair balance');

        const results = {
            retried: 0,
            succeeded: 0,
            failed: 0
        };

        for (const deposit of failedDeposits) {
            try {
                // Reset to PENDING for retry
                deposit.status = DEPOSIT_STATUS.PENDING;
                deposit.retryCount = (deposit.retryCount || 0) + 1;
                await deposit.save();

                results.retried++;
                logger.log(`Retrying deposit ${deposit._id} (attempt ${deposit.retryCount})`);
            } catch (error) {
                logger.error(`Failed to retry deposit ${deposit._id}: ${error.message}`);
            }
        }

        return results;

    } catch (error) {
        logger.error(`Error: ${error.message}`);
        return { retried: 0, succeeded: 0, failed: 0 };
    }
}

/**
 * Sweep a single Bitcoin deposit from user wallet to admin wallet
 * Now uses the agnostic btcTransfer function
 */
async function sweepSingleBitcoinDeposit(deposit) {
    const sweepLogger = btcSweepLogger || console;
    const wallet = deposit.wallet;
    const pair = deposit.pair;

    // Validate master mnemonic
    if (!process.env.MASTER_MNEMONIC) {
        throw new Error('MASTER_MNEMONIC environment variable not set');
    }

    // Get admin wallet for Bitcoin
    const adminWallet = await AdminWallet.findOne({
        chainType: CHAIN_TYPES.BTC,
        isActive: true
    }).select('+derivationPath');

    if (!adminWallet) {
        throw new Error('No active Bitcoin admin wallet found');
    }

    // Use the agnostic btcTransfer function to sweep the deposit
    const transferResult = await btcTransfer({
        apiUrl: BTC_API_URL,
        fromAddress: wallet.address,
        toAddress: adminWallet.address,
        mnemonic: process.env.MASTER_MNEMONIC,
        derivationPath: wallet.derivationPath,
        amount: deposit.amountSmallest,
        options: {
            minConfirmations: MIN_CONFIRMATIONS,
            sweepAll: true // Sweep all funds minus fees
        }
    });

    // Update accounting - wrap in try-catch
    try {
        // Convert actual swept amount to BTC
        const actualSweptAmountSat = transferResult.actualAmount;
        const actualSweptAmount = toReadableUnit(actualSweptAmountSat.toString(), 8);

        await addDeposit(
            deposit.tradingAccount,
            pair.baseAsset,
            actualSweptAmount,
            NETWORKS.BITCOIN
        );

        // Update admin balance
        await addAdminBalance(
            pair.baseAsset,
            actualSweptAmount,
            NETWORKS.BITCOIN
        );

        // Mark deposit as swept
        deposit.status = DEPOSIT_STATUS.SWEPT;
        deposit.sweptAt = new Date();
        deposit.sweepTxHash = transferResult.txHash;
        deposit.sweptToAdminWallet = adminWallet._id;
        deposit.actualSweptAmount = actualSweptAmount;
        deposit.actualSweptAmountSmallest = actualSweptAmountSat.toString();
        deposit.sweepFee = transferResult.fee;
        deposit.sweepFeeRate = transferResult.feeRate;
        await deposit.save();

        sweepLogger.log(
            `Swept ${actualSweptAmount} BTC to admin wallet. ` +
            `TX: ${transferResult.txHash}, Fee: ${transferResult.fee} sat (${transferResult.feeRate} sat/vB)`
        );

    } catch (updateError) {
        // Transaction succeeded but accounting failed - critical error
        sweepLogger.error(
            `CRITICAL: Sweep succeeded but accounting failed for deposit ${deposit._id}. ` +
            `TX: ${transferResult.txHash}`,
            updateError
        );

        // Still mark as swept with the tx hash so we don't try again
        deposit.status = DEPOSIT_STATUS.SWEPT;
        deposit.sweptAt = new Date();
        deposit.sweepTxHash = transferResult.txHash;
        deposit.sweptToAdminWallet = adminWallet._id;
        deposit.accountingError = updateError.message;
        await deposit.save();

        throw new Error(`Accounting failed after successful sweep: ${updateError.message}`);
    }
}