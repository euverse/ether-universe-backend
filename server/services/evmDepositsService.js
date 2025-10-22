import { ethers } from 'ethers';
import { CHAIN_TYPES, NETWORKS } from '../db/schemas/Network.js';
import { DEPOSIT_STATUS } from '../db/schemas/Deposit.js';

const Pair = getModel('Pair');
const Wallet = getModel('Wallet');
const Balance = getModel('Balance');
const Deposit = getModel('Deposit');
const AdminWallet = getModel('AdminWallet');

const rpcUrls = useRuntimeConfig().rpcUrls;

// RPC endpoints
const RPC_ENDPOINTS = {
    [NETWORKS.ETHEREUM]: rpcUrls.ETH_RPC_URL,
    [NETWORKS.POLYGON]: rpcUrls.POLYGON_RPC_URL,
};

// Minimum balance thresholds (in human-readable format)
const MIN_BALANCE_THRESHOLDS = {
    ETH: '0.001',
    USDT: '1',
    USDC: '1',
    DAI: '1'
};

/**
 * Get provider for network
 */
function getProvider(network) {
    const rpcUrl = RPC_ENDPOINTS[network];
    if (!rpcUrl) {
        throw new Error(`No RPC endpoint configured for network: ${network}`);
    }
    return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Get native token balance for an address
 */
async function getNativeBalance(network, address) {
    const provider = getProvider(network);
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
}

/**
 * Get ERC-20 token balance for an address
 */
async function getTokenBalance(network, tokenAddress, walletAddress, decimals) {
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
function meetsMinimumThreshold(amount, pairSymbol) {
    const threshold = MIN_BALANCE_THRESHOLDS[pairSymbol] || '0';
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

    let total = '0';
    for (const deposit of pendingDeposits) {
        total = add(total, deposit.amountSmallest);
    }

    return total;
}

/**
 * Scan a single wallet for deposits on a specific network
 * Pure balance-based approach - query balance, calculate new deposits
 */
export async function scanWalletForDeposits(wallet, network, pairs) {
    const deposits = [];

    try {
        // Scan for each pair
        for (const pair of pairs) {
            try {
                let onchainBalance = '0';

                // Get on-chain balance
                if (!pair.contractAddresses || !pair.contractAddresses.get(network)) {
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
                if (!meetsMinimumThreshold(onchainBalance, pair.symbol)) {
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
                    detectedAt: new Date()
                });

                deposits.push(deposit);

                console.log(`[scanWalletForDeposits] New deposit detected: ${newDepositAmount} ${pair.symbol} on ${network}`);

            } catch (pairError) {
                console.error(`[scanWalletForDeposits] Error scanning pair ${pair.symbol}:`, pairError.message);
            }
        }

    } catch (error) {
        console.error(`[scanWalletForDeposits] Error scanning wallet ${wallet._id} on ${network}:`, error);
    }

    return deposits;
}

/**
 * Scan all EVM wallets for deposits
 * Runs periodically (every 2-3 minutes)
 */
export async function scanAllEVMWalletsForDeposits() {
    try {
        // Get all EVM wallets
        const wallets = await Wallet.find({
            chainType: CHAIN_TYPES.EVM
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

        return results;

    } catch (error) {
        console.error('[scanAllEVMWalletsForDeposits] Error:', error);
        return { scanned: 0, found: 0, deposits: [] };
    }
}

/**
 * Sweep pending deposits to admin wallet
 * Takes deposits in PENDING status and moves funds to admin wallet
 */
export async function sweepPendingDeposits() {
    try {
        // Get pending deposits ready to be swept
        const depositsToSweep = await Deposit.find({
            network: { $in: [NETWORKS.ETHEREUM, NETWORKS.POLYGON] },
            status: DEPOSIT_STATUS.PENDING
        }).populate('wallet pair balance');

        const results = {
            swept: 0,
            failed: 0,
            details: []
        };

        for (const deposit of depositsToSweep) {
            try {
                await sweepSingleDeposit(deposit);
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
                console.error(`[sweepPendingDeposits] Failed to sweep deposit ${deposit._id}:`, error);
            }
        }

        return results;

    } catch (error) {
        console.error('[sweepPendingDeposits] Error:', error);
        return { swept: 0, failed: 0, details: [] };
    }
}

/**
 * Sweep a single deposit from user wallet to admin wallet
 */
async function sweepSingleDeposit(deposit) {
    const wallet = deposit.wallet;
    const pair = deposit.pair;
    const network = deposit.network;

    // Get admin wallet for this chain type
    const adminWallet = await AdminWallet.findOne({
        chainType: wallet.chainType,
        isActive: true
    }).select('+derivationPath');

    if (!adminWallet) {
        throw new Error('No active admin wallet found');
    }

    // Get provider and signer
    const provider = getProvider(network);
    const mnemonic = ethers.Mnemonic.fromPhrase(process.env.MASTER_MNEMONIC);
    const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonic, "m");
    const signer = hdNode.derivePath(wallet.derivationPath).connect(provider);

    let txHash;

    // Execute sweep transaction
    if (!pair.contractAddresses || !pair.contractAddresses.get(network)) {
        // Native token (ETH)
        const balance = await provider.getBalance(wallet.address);
        const gasPrice = (await provider.getFeeData()).gasPrice;
        const gasLimit = 21000n;
        const gasCost = gasPrice * gasLimit;

        const amountToSend = balance - gasCost;

        if (amountToSend <= 0n) {
            throw new Error('Insufficient balance to cover gas fees');
        }

        const tx = await signer.sendTransaction({
            to: adminWallet.address,
            value: amountToSend,
            gasLimit
        });

        const receipt = await tx.wait();
        txHash = receipt.hash;

    } else {
        // ERC-20 token
        const tokenAddress = pair.contractAddresses.get(network);
        const contract = new ethers.Contract(
            tokenAddress,
            ['function transfer(address to, uint256 amount) returns (bool)'],
            signer
        );

        const amountSmallest = toSmallestUnit(deposit.amount, pair.decimals);
        const tx = await contract.transfer(adminWallet.address, amountSmallest);
        const receipt = await tx.wait();
        txHash = receipt.hash;
    }
    await addDeposit(
        deposit.tradingAccount,
        pair.baseAsset,
        deposit.amount,
        network
    );

    // Update admin balance using utility
    await addAdminBalance(
        pair.baseAsset,
        deposit.amount,
        network
    );

    // Mark deposit as swept
    deposit.status = DEPOSIT_STATUS.SWEPT;
    deposit.sweptAt = new Date();
    deposit.sweepTxHash = txHash;
    deposit.sweptToAdminWallet = adminWallet._id;
    await deposit.save();

    console.log(`[sweepSingleDeposit] Swept ${deposit.amount} ${pair.symbol} to admin wallet. TX: ${txHash}`);
}