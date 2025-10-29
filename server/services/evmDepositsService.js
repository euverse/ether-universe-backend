import { ethers } from 'ethers';
import { CHAIN_TYPES, NETWORKS } from '../db/schemas/Network.js';
import { DEPOSIT_STATUS } from '../db/schemas/Deposit.js';
import { evmDepositScanLogger, evmSweepLogger } from './logService.js';

const Pair = getModel('Pair');
const Wallet = getModel('Wallet');
const Balance = getModel('Balance');
const Deposit = getModel('Deposit');
const AdminWallet = getModel('AdminWallet');

const rpcUrls = useRuntimeConfig().rpcUrls;

// RPC endpoints
const RPC_ENDPOINTS = {
    [NETWORKS.ETHEREUM]: rpcUrls.ethereum,
    [NETWORKS.POLYGON]: rpcUrls.polygon,
};

// Minimum balance thresholds (in human-readable format)
const MIN_BALANCE_THRESHOLDS = {
    ETH: '0.001',
    USDT: '1',
};

// Minimum ETH required for ERC-20 sweeps (in ETH)
const MIN_ETH_FOR_ERC20_SWEEP = '0.001';

const logger = evmDepositScanLogger || console;

/**
 * Get provider for network
 */
function getProvider(network) {
    const rpcUrl = RPC_ENDPOINTS[network];
    if (!rpcUrl) {
        throw new Error(`No RPC endpoint configured for network: ${network}`);
    }
    return createProvider(rpcUrl);
}

/**
 * Validate that network is supported
 */
function isNetworkSupported(network) {
    return Object.keys(RPC_ENDPOINTS).includes(network);
}

/**
 * Get native token balance for an address
 */
async function getNativeBalance(network, walletAddress) {
    if (!ethers.isAddress(walletAddress)) {
        throw new Error(`Invalid wallet address: ${walletAddress}`);
    }

    const provider = getProvider(network);
    const balance = await provider.getBalance(walletAddress);
    return ethers.formatEther(balance);
}

/**
 * Get ERC-20 token balance for an address
 */
async function getTokenBalance(network, tokenAddress, walletAddress, decimals) {
    if (!ethers.isAddress(tokenAddress)) {
        throw new Error(`Invalid token address: ${tokenAddress}`);
    }
    if (!ethers.isAddress(walletAddress)) {
        throw new Error(`Invalid wallet address: ${walletAddress}`);
    }
    if (!decimals || decimals < 0) {
        throw new Error(`Invalid decimals: ${decimals}`);
    }

    const provider = getProvider(network);
    const contract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        provider
    );

    const balance = await contract.balanceOf(walletAddress);
    return ethers.formatUnits(balance, decimals);
}

/**
 * Check if balance meets minimum threshold
 */
function meetsMinimumThreshold(amount, pairBaseAsset) {
    const threshold = MIN_BALANCE_THRESHOLDS[pairBaseAsset] || '0';
    return parseFloat(amount) >= parseFloat(threshold);
}

/**
 * Calculate total pending deposit amount for a wallet-pair-network combo
 */
async function getPendingDepositAmount(walletId, pairId, network) {
    const pendingDeposits = await Deposit.find({
        wallet: walletId,
        pair: pairId,
        network,
        status: DEPOSIT_STATUS.PENDING
    });

    let total = pendingDeposits.reduce((total, deposit) => add(total, deposit.amountSmallest), '0');

    return total;
}

/**
 * Scan a single wallet for deposits on a specific network
 * Pure balance-based approach - query balance, calculate new deposits
 */
export async function scanWalletForDeposits(wallet, network, pairs) {
    const deposits = [];

    // Validate network is supported
    if (!isNetworkSupported(network)) {
        logger.warn(` Unsupported network: ${network}`);
        return deposits;
    }

    // Validate wallet address
    if (!wallet.address || !ethers.isAddress(wallet.address)) {
        logger.error(` Invalid wallet address for wallet ${wallet._id}`);
        return deposits;
    }

    try {
        // Scan for each pair
        for (const pair of pairs) {
            try {
                // Validate pair has required fields
                if (!pair.symbol || !pair.decimals || pair.decimals < 0) {
                    logger.error(` Invalid pair configuration for pair ${pair._id}`);
                    continue;
                }

                let onchainBalance = '0';

                // Get on-chain balance
                if (!pair.contractAddresses?.get?.(network)) {
                    // Native token (ETH)
                    if (pair.symbol === 'ETH') {
                        onchainBalance = await getNativeBalance(network, wallet.address);
                    }
                } else {
                    // ERC-20 token
                    const tokenAddress = pair.contractAddresses.get(network);
                    onchainBalance = await getTokenBalance(
                        network,
                        tokenAddress,
                        wallet.address,
                        pair.decimals
                    );
                }

                // Check if balance meets minimum threshold
                if (!meetsMinimumThreshold(onchainBalance, pair.baseAsset)) {
                    continue;
                }

                // Get or create balance record
                const balance = await Balance.findOneAndUpdate(
                    {
                        wallet: wallet._id,
                        pair: pair._id,
                        network
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

                // Calculate total pending deposit amount (not yet swept)
                const pendingAmountSmallest = await getPendingDepositAmount(
                    wallet._id,
                    pair._id,
                    network
                );

                // Convert on-chain balance to smallest units
                const onchainBalanceSmallest = toSmallestUnit(onchainBalance, pair.decimals);

                // Calculate new deposit amount
                // New deposit = on-chain balance - pending deposits
                const newDepositAmountSmallest = subtract(
                    onchainBalanceSmallest,
                    pendingAmountSmallest
                );

                // Check if there's a new deposit
                if (compare(newDepositAmountSmallest, '0') <= 0) {
                    continue; // No new deposit
                }

                // Convert to human-readable
                const newDepositAmount = toReadableUnit(newDepositAmountSmallest, pair.decimals);

                // Simple duplicate prevention - check if deposit with same amount was recently created
                const recentDuplicate = await Deposit.findOne({
                    wallet: wallet._id,
                    pair: pair._id,
                    network,
                    amountSmallest: newDepositAmountSmallest,
                    status: DEPOSIT_STATUS.PENDING,
                    createdAt: { $gte: new Date(Date.now() - 120000) } // Within last 2 minutes
                });

                if (recentDuplicate) {
                    logger.log(` Skipping duplicate deposit for ${pair.symbol}`);
                    continue;
                }

                // Create deposit record as PENDING (ready to be swept)
                const deposit = await Deposit.create({
                    tradingAccount: wallet.tradingAccount,
                    wallet: wallet._id,
                    balance: balance._id,
                    network,
                    pair: pair._id,
                    amount: newDepositAmount,
                    amountSmallest: newDepositAmountSmallest,
                    status: DEPOSIT_STATUS.PENDING,
                });

                deposits.push(deposit);

                logger.log(` New deposit detected: ${newDepositAmount} ${pair.symbol} on ${network}`);

            } catch (pairError) {
                logger.error(` Error scanning pair ${pair.symbol}: ${pairError.message}`);
            }
        }

        // Log successful scans with no deposits for monitoring
        if (deposits.length === 0) {
            logger.log(` Scan completed for wallet ${wallet._id} on ${network} - no new deposits found`);
        }

    } catch (error) {
        logger.error(` Error scanning wallet ${wallet._id} on ${network}:`, error);
    }

    return deposits;
}

/**
 * Scan all EVM wallets for deposits
 * Runs periodically (every 2-3 minutes)
 */
export async function scanAllEVMWalletsForDeposits() {
    try {
        // Get all active EVM wallets
        const wallets = await Wallet.find({
            chainType: CHAIN_TYPES.EVM,
        });

        const results = {
            scanned: 0,
            found: 0,
            deposits: []
        };

        // Get all active EVM pairs
        const pairs = await Pair.find({
            chainType: CHAIN_TYPES.EVM,
            isActive: true
        });

        const networks = [NETWORKS.ETHEREUM, NETWORKS.POLYGON];

        for (const wallet of wallets) {
            for (const network of networks) {
                const deposits = await scanWalletForDeposits(wallet, network, pairs);

                results.found += deposits.length;
                results.deposits.push(...deposits);
                results.scanned++;
            }
        }

        logger.log(`Completed: ${results.scanned} scans, ${results.found} deposits found`);

        return results;

    } catch (error) {
        logger.error(`Error ${error.message}`);
        return { scanned: 0, found: 0, deposits: [] };
    }
}

/**
 * Check if wallet has sufficient ETH for ERC-20 sweep
 */
async function hasEnoughEthForGas(network, walletAddress) {
    try {
        const ethBalance = await getNativeBalance(network, walletAddress);
        return parseFloat(ethBalance) >= parseFloat(MIN_ETH_FOR_ERC20_SWEEP);
    } catch (error) {
        logger.error(`Error checking ETH balance for ${walletAddress}:`, error.message);
        return false;
    }
}

/**
 * Fund user wallet with ETH for gas (ERC-20 sweeps only)
 * Sends ETH from admin wallet to user wallet to cover gas fees
 */
async function fundWalletWithGas(deposit, network, userWalletAddress) {
    const sweepLogger = evmSweepLogger || console;

    // Validate master mnemonic
    if (!process.env.MASTER_MNEMONIC) {
        throw new Error('MASTER_MNEMONIC environment variable not set');
    }

    // Get admin wallet for this network
    const adminWallet = await AdminWallet.findOne({
        chainType: CHAIN_TYPES.EVM,
        network: network,
        isActive: true
    }).select('+derivationPath');

    if (!adminWallet) {
        throw new Error(`No active admin wallet found for EVM on ${network}`);
    }

    // Validate admin wallet address
    if (!adminWallet.address || !ethers.isAddress(adminWallet.address)) {
        throw new Error(`Invalid admin wallet address for ${network}`);
    }

    // Get provider and create admin signer
    const provider = getProvider(network);
    const adminSigner = createSignerFromMnemonic(
        process.env.MASTER_MNEMONIC,
        adminWallet.derivationPath,
        provider
    );

    // Calculate required gas amount
    const gasAmountNeeded = await calculateGasForERC20Transfer(provider);

    // Check admin wallet has enough ETH
    const adminEthBalance = await provider.getBalance(adminWallet.address);
    if (adminEthBalance < BigInt(gasAmountNeeded)) {
        throw new Error(
            `Admin wallet has insufficient ETH. Balance: ${ethers.formatEther(adminEthBalance)} ETH, ` +
            `Required: ${ethers.formatEther(gasAmountNeeded)} ETH`
        );
    }

    sweepLogger.log(`Funding wallet ${userWalletAddress} with ${ethers.formatEther(gasAmountNeeded)} ETH for gas`);

    // Send ETH from admin to user wallet for gas
    const fundingResult = await evmTransfer({
        provider,
        signer: adminSigner,
        toAddress: userWalletAddress,
        amount: gasAmountNeeded,
        deductGasFromAmount: false // Admin pays its own gas
    });

    // Update deposit record with gas funding info
    deposit.gasFundingTxHash = fundingResult.txHash;
    deposit.gasFundingAmount = fundingResult.actualAmount;
    deposit.gasFundedAt = new Date();
    deposit.gasFundingAttempts = (deposit.gasFundingAttempts || 0) + 1;
    await deposit.save();

    sweepLogger.log(`Gas funding successful. TX: ${fundingResult.txHash}`);

    return fundingResult;
}


/**
 * Sweep pending deposits to admin wallet
 * Takes deposits in PENDING status and moves funds to admin wallet
 * For ERC-20 tokens: funds gas first, then sweeps
 */
export async function sweepPendingDeposits() {
    const sweepLogger = evmSweepLogger || console;
    try {
        // Get pending deposits ready to be swept OR those waiting for gas funding confirmation
        const depositsToProcess = await Deposit.find({
            network: { $in: [NETWORKS.ETHEREUM, NETWORKS.POLYGON] },
            status: { $in: [DEPOSIT_STATUS.PENDING, DEPOSIT_STATUS.FUNDING_GAS] }
        }).populate('wallet pair balance');

        const results = {
            swept: 0,
            gasFunded: 0,
            failed: 0,
            details: []
        };

        for (const deposit of depositsToProcess) {
            // Validate populated fields
            if (!deposit.wallet || !deposit.pair || !deposit.balance) {
                sweepLogger.error(`Invalid deposit ${deposit._id}: missing populated fields`);
                results.failed++;
                continue;
            }

            // Validate amountSmallest exists
            if (!deposit.amountSmallest || compare(deposit.amountSmallest, '0') <= 0) {
                sweepLogger.error(`Invalid deposit ${deposit._id}: invalid amountSmallest`);
                results.failed++;
                continue;
            }

            // Determine if this is an ERC-20 token
            const isERC20 = deposit.pair.contractAddresses?.get?.(deposit.network);

            try {
                // === HANDLE ERC-20 GAS FUNDING ===
                if (isERC20 && deposit.status === DEPOSIT_STATUS.PENDING) {
                    // Check if wallet already has enough ETH for gas
                    const hasEth = await hasEnoughEthForGas(deposit.network, deposit.wallet.address);

                    if (!hasEth) {
                        // Prevent excessive funding attempts
                        if ((deposit.gasFundingAttempts || 0) >= 3) {
                            sweepLogger.warn(`Deposit ${deposit._id} has exceeded max gas funding attempts (3). Skipping.`);
                            continue;
                        }

                        // Mark as funding gas
                        const updated = await Deposit.findOneAndUpdate(
                            { _id: deposit._id, status: DEPOSIT_STATUS.PENDING },
                            { $set: { status: DEPOSIT_STATUS.FUNDING_GAS } },
                            { new: true }
                        ).populate('wallet pair balance');

                        if (!updated) {
                            sweepLogger.log(`Deposit ${deposit._id} already being processed`);
                            continue;
                        }

                        try {
                            // Fund the wallet with gas
                            await fundWalletWithGas(updated, deposit.network, deposit.wallet.address);

                            // After funding, mark back as PENDING so it will be swept in next iteration
                            updated.status = DEPOSIT_STATUS.PENDING;
                            await updated.save();

                            results.gasFunded++;
                            results.details.push({
                                depositId: deposit._id,
                                amount: deposit.amount,
                                pair: deposit.pair.symbol,
                                network: deposit.network,
                                status: 'gas_funded'
                            });

                            sweepLogger.log(`Gas funded for deposit ${deposit._id}. Will sweep in next cycle.`);
                            continue; // Move to next deposit, this one will be swept in next iteration

                        } catch (fundingError) {
                            // Mark as failed
                            await Deposit.findByIdAndUpdate(deposit._id, {
                                status: DEPOSIT_STATUS.FAILED,
                                failureReason: `Gas funding failed: ${fundingError.message}`,
                                failedAt: new Date()
                            });

                            results.failed++;
                            results.details.push({
                                depositId: deposit._id,
                                amount: deposit.amount,
                                pair: deposit.pair.symbol,
                                network: deposit.network,
                                status: 'gas_funding_failed',
                                error: fundingError.message
                            });

                            sweepLogger.error(`Failed to fund gas for deposit ${deposit._id}:`, fundingError);
                            continue;
                        }
                    }
                    // If has ETH, fall through to sweep below
                }

                // === HANDLE SWEEP (Native tokens OR ERC-20 with gas funded) ===
                if (deposit.status === DEPOSIT_STATUS.PENDING) {
                    // For ERC-20, verify gas is still available (in case it was consumed)
                    if (isERC20) {
                        const hasEth = await hasEnoughEthForGas(deposit.network, deposit.wallet.address);
                        if (!hasEth) {
                            sweepLogger.warn(`Wallet ${deposit.wallet._id} lost ETH after funding. Will retry funding.`);
                            // Reset to allow refunding
                            continue;
                        }
                    }

                    // Mark as processing to prevent concurrent sweeps
                    const updated = await Deposit.findOneAndUpdate(
                        { _id: deposit._id, status: DEPOSIT_STATUS.PENDING },
                        { $set: { status: DEPOSIT_STATUS.PROCESSING } },
                        { new: true }
                    )
                        .populate('wallet')
                        .exec();

                    if (!updated) {
                        sweepLogger.log(`Deposit ${deposit._id} already being processed`);
                        continue;
                    }

                    await sweepSingleDeposit(updated);
                    results.swept++;
                    results.details.push({
                        depositId: deposit._id,
                        amount: deposit.amount,
                        pair: deposit.pair.symbol,
                        network: deposit.network,
                        status: 'success'
                    });
                }

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
                sweepLogger.error(`Failed to process deposit ${deposit._id}:`, error);
            }
        }

        sweepLogger.log(`Completed: ${results.swept} swept, ${results.gasFunded} gas funded, ${results.failed} failed`);

        return results;

    } catch (error) {
        sweepLogger.error('Error:', error);
        return { swept: 0, gasFunded: 0, failed: 0, details: [] };
    }
}

/**
 * Retry failed deposits
 */
export async function retryFailedDeposits() {
    try {
        // Get failed deposits that haven't been retried too many times
        const failedDeposits = await Deposit.find({
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
                logger.error(`Failed to retry deposit ${deposit._id}:`, error);
            }
        }

        return results;

    } catch (error) {
        logger.error('Error:', error);
        return { retried: 0, succeeded: 0, failed: 0 };
    }
}

/**
 * Sweep a single deposit from user wallet to admin wallet
 * Now uses the agnostic evmTransfer function
 */
async function sweepSingleDeposit(deposit) {
    const sweepLogger = evmSweepLogger || console;

    const wallet = deposit.wallet;
    const pair = deposit.pair;
    const network = deposit.network;

    // Validate master mnemonic
    if (!process.env.MASTER_MNEMONIC) {
        throw new Error('MASTER_MNEMONIC environment variable not set');
    }

    // Validate pair decimals
    if (!pair.decimals || pair.decimals < 0) {
        throw new Error(`Invalid pair decimals for ${pair.symbol}`);
    }

    // Get admin wallet by both chainType AND network
    const adminWallet = await AdminWallet.findOne({
        chainType: wallet.chainType,
        network: network,
        isActive: true
    }).select('+derivationPath');

    if (!adminWallet) {
        throw new Error(`No active admin wallet found for ${wallet.chainType} on ${network}`);
    }

    // Validate admin wallet address
    if (!adminWallet.address || !ethers.isAddress(adminWallet.address)) {
        throw new Error(`Invalid admin wallet address for ${network}`);
    }

    // Get provider and create signer
    const provider = getProvider(network);
    const signer = createSignerFromMnemonic(
        process.env.MASTER_MNEMONIC,
        wallet.derivationPath,
        provider
    );

    let transferResult;

    // Determine if this is a native token or ERC-20
    const isNativeToken = !pair.contractAddresses?.get?.(network);

    if (isNativeToken) {
        // Native token transfer (ETH, MATIC, etc.)
        transferResult = await evmTransfer({
            provider,
            signer,
            toAddress: adminWallet.address,
            amount: deposit.amountSmallest,
            deductGasFromAmount: true // Sweep full balance minus gas
        });
    } else {
        // ERC-20 token transfer
        const tokenAddress = pair.contractAddresses.get(network);

        if (!ethers.isAddress(tokenAddress)) {
            throw new Error(`Invalid token contract address for ${pair.symbol} on ${network}`);
        }

        transferResult = await evmTransfer({
            provider,
            signer,
            toAddress: adminWallet.address,
            amount: deposit.amountSmallest,
            tokenConfig: {
                address: tokenAddress,
                decimals: pair.decimals
            }
        });
    }

    // Handle accounting updates
    try {
        // Convert actualSweptAmount back to readable for accounting
        const actualSweptAmountReadable = toReadableUnit(transferResult.actualAmount, pair.decimals);

        await addDeposit(
            deposit.tradingAccount,
            pair.baseAsset,
            actualSweptAmountReadable,
            network
        );

        // Update admin balance using utility
        await addAdminBalance(
            pair.baseAsset,
            actualSweptAmountReadable,
            network
        );

        // Mark deposit as swept
        deposit.status = DEPOSIT_STATUS.SWEPT;
        deposit.sweptAt = new Date();
        deposit.sweepTxHash = transferResult.txHash;
        deposit.sweptToAdminWallet = adminWallet._id;
        deposit.actualSweptAmount = actualSweptAmountReadable;
        deposit.actualSweptAmountSmallest = transferResult.actualAmount;
        await deposit.save();

        sweepLogger.log(`Swept ${actualSweptAmountReadable} ${pair.symbol} to admin wallet. TX: ${transferResult.txHash}`);

    } catch (updateError) {
        // Transaction succeeded but accounting failed - critical error
        sweepLogger.error(`CRITICAL: Sweep succeeded but accounting failed for deposit ${deposit._id}. TX: ${transferResult.txHash}`, updateError);

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