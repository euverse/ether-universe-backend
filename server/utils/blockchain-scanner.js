import { ethers } from 'ethers';
import { model } from 'mongoose';
import { NETWORKS } from '../db/schemas/Wallet.js';

// RPC endpoints (add your own or use public ones)
const RPC_ENDPOINTS = {
    [NETWORKS.ETHEREUM]: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
    [NETWORKS.POLYGON]: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    [NETWORKS.BSC]: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    [NETWORKS.ARBITRUM]: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    [NETWORKS.OPTIMISM]: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
};

// Required confirmations per network
const REQUIRED_CONFIRMATIONS = {
    [NETWORKS.ETHEREUM]: 12,
    [NETWORKS.POLYGON]: 128,
    [NETWORKS.BSC]: 15,
    [NETWORKS.ARBITRUM]: 10,
    [NETWORKS.OPTIMISM]: 10,
    [NETWORKS.BTC]: 3,
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
 * Scan EVM network for deposits to a specific address
 */
export async function scanEVMDeposits(network, address, fromBlock, toBlock = 'latest') {
    try {
        const provider = getProvider(network);
        
        // Get transaction history
        const history = await provider.send('eth_getLogs', [{
            address: null,
            fromBlock: ethers.toQuantity(fromBlock),
            toBlock: toBlock,
            topics: [
                null,
                null,
                ethers.zeroPadValue(address, 32)
            ]
        }]);

        const deposits = [];

        for (const log of history) {
            const tx = await provider.getTransaction(log.transactionHash);
            
            if (tx && tx.to && tx.to.toLowerCase() === address.toLowerCase()) {
                const receipt = await provider.getTransactionReceipt(log.transactionHash);
                
                deposits.push({
                    txHash: tx.hash,
                    from: tx.from,
                    to: tx.to,
                    value: ethers.formatEther(tx.value),
                    blockNumber: tx.blockNumber,
                    confirmations: receipt.confirmations || 0,
                    network
                });
            }
        }

        return deposits;

    } catch (error) {
        console.error(`[scanEVMDeposits] Error scanning ${network}:`, error);
        return [];
    }
}

/**
 * Get current block number for network
 */
export async function getCurrentBlockNumber(network) {
    try {
        if (network === NETWORKS.BTC) {
            // BTC block scanning would need different implementation
            return 0;
        }

        const provider = getProvider(network);
        return await provider.getBlockNumber();

    } catch (error) {
        console.error(`[getCurrentBlockNumber] Error for ${network}:`, error);
        return 0;
    }
}

/**
 * Check confirmations for a transaction
 */
export async function getTransactionConfirmations(network, txHash) {
    try {
        if (network === NETWORKS.BTC) {
            // BTC would need different implementation
            return 0;
        }

        const provider = getProvider(network);
        const tx = await provider.getTransaction(txHash);
        
        if (!tx || !tx.blockNumber) {
            return 0;
        }

        const currentBlock = await provider.getBlockNumber();
        return currentBlock - tx.blockNumber + 1;

    } catch (error) {
        console.error(`[getTransactionConfirmations] Error:`, error);
        return 0;
    }
}

/**
 * Get required confirmations for network
 */
export function getRequiredConfirmations(network) {
    return REQUIRED_CONFIRMATIONS[network] || 12;
}

/**
 * Check if deposit is confirmed
 */
export async function isDepositConfirmed(depositId) {
    try {
        const Deposit = model('Deposit');
        const deposit = await Deposit.findById(depositId);

        if (!deposit) {
            return false;
        }

        const currentConfirmations = await getTransactionConfirmations(
            deposit.network,
            deposit.txHash
        );

        return currentConfirmations >= deposit.requiredConfirmations;

    } catch (error) {
        console.error('[isDepositConfirmed] Error:', error);
        return false;
    }
}