import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';

const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

// Bitcoin network configuration
const BITCOIN_NETWORK = bitcoin.networks.bitcoin;

// Fee buffer multiplier (20% buffer for fee rate increases)
const FEE_BUFFER_MULTIPLIER = 1.2;

// Dust limit for Bitcoin outputs (546 satoshis)
const DUST_LIMIT = 546;

/**
 * Get UTXOs for an address with confirmation filtering
 */
async function getUTXOs(apiUrl, address, minConfirmations = 0) {
    try {
        const utxos = await $fetch(`${apiUrl}/address/${address}/utxo`, {
            timeout: 10000
        });

        // Filter by confirmations if required
        if (minConfirmations > 0) {
            // Get current block height
            const blockHeight = await $fetch(`${apiUrl}/blocks/tip/height`, {
                timeout: 10000
            });

            return utxos.filter(utxo => {
                const confirmations = utxo.status?.confirmed ?
                    blockHeight - utxo.status.block_height + 1 : 0;
                return confirmations >= minConfirmations;
            });
        }

        return utxos;

    } catch (error) {
        console.error(`[getUTXOs] Error fetching UTXOs for ${address}:`, error.message);
        throw error;
    }
}

/**
 * Estimate transaction fee
 */
async function estimateFee(apiUrl) {
    try {
        const feeEstimates = await $fetch(`${apiUrl}/fee-estimates`, {
            timeout: 10000
        });

        // Use the fee for next block (fastest confirmation)
        // Returns sat/vB
        const feeRate = Math.ceil(feeEstimates['1'] || 1);

        // Apply minimum fee rate of 1 sat/vB
        return Math.max(feeRate, 1);

    } catch (error) {
        console.error(`[estimateFee] Error:`, error.message);
        // Default to 2 sat/vB if estimation fails (safer than 1)
        return 2;
    }
}

/**
 * Calculate transaction size more accurately
 * For P2WPKH (native SegWit): 
 * - Base: 10.5 vBytes
 * - Input: 68 vBytes each
 * - Output: 31 vBytes each
 */
function calculateTxSize(inputCount, outputCount) {
    const baseSize = 10.5;
    const inputSize = 68;
    const outputSize = 31;

    return Math.ceil(baseSize + (inputCount * inputSize) + (outputCount * outputSize));
}

/**
 * Broadcast Bitcoin transaction
 */
async function broadcastTransaction(apiUrl, txHex) {
    try {
        const txid = await $fetch(`${apiUrl}/tx`, {
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
 * Create signing key pair from mnemonic and derivation path
 */
function createKeyPair(mnemonic, derivationPath) {
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, BITCOIN_NETWORK);
    const child = root.derivePath(derivationPath);
    return ECPair.fromPrivateKey(child.privateKey, { network: BITCOIN_NETWORK });
}

/**
 * Agnostic Bitcoin transfer function
 * Handles Bitcoin transactions with automatic UTXO selection and fee calculation
 * 
 * @param {Object} params - Transfer parameters
 * @param {string} params.apiUrl - Bitcoin API endpoint (e.g., blockstream.info API)
 * @param {string} params.fromAddress - Sender's Bitcoin address
 * @param {string} params.toAddress - Recipient's Bitcoin address
 * @param {string} params.mnemonic - BIP39 mnemonic phrase for signing
 * @param {string} params.derivationPath - BIP32 derivation path for the wallet
 * @param {string|number} params.amount - Amount to transfer in satoshis
 * @param {Object} [params.options] - Optional parameters
 * @param {number} [params.options.minConfirmations=0] - Minimum confirmations required for UTXOs
 * @param {boolean} [params.options.feesInclusive=false] - Sweep all funds (amount = total - fees)
 * @param {number} [params.options.customFeeRate] - Custom fee rate in sat/vB (overrides estimation)
 * @param {number} [params.options.feeBuffer=1.2] - Fee buffer multiplier
 * 
 * @returns {Promise<Object>} Transaction result
 * @returns {string} result.txHash - Transaction hash (txid)
 * @returns {number} result.actualAmount - Actual amount transferred in satoshis
 * @returns {number} result.fee - Transaction fee in satoshis
 * @returns {number} result.feeRate - Effective fee rate in sat/vB
 * @returns {number} result.txSize - Transaction size in vBytes
 * @returns {Object} result.tx - Raw transaction object
 * 
 * @throws {Error} If transfer fails or validation fails
 */
export async function btcTransfer({
    apiUrl,
    fromAddress,
    toAddress,
    mnemonic,
    derivationPath,
    amount,
    options = {}
}) {
    // Validate inputs
    if (!apiUrl || !fromAddress || !toAddress || !mnemonic || !derivationPath) {
        throw new Error('Missing required parameters: apiUrl, fromAddress, toAddress, mnemonic, and derivationPath are required');
    }

    // Validate Bitcoin addresses
    try {
        bitcoin.address.toOutputScript(fromAddress, BITCOIN_NETWORK);
        bitcoin.address.toOutputScript(toAddress, BITCOIN_NETWORK);
    } catch (error) {
        throw new Error(`Invalid Bitcoin address: ${error.message}`);
    }

    // Parse options
    const {
        minConfirmations = 0,
        feesInclusive = false,
        customFeeRate = null,
        feeBuffer = FEE_BUFFER_MULTIPLIER
    } = options;

    // Get UTXOs for sender wallet
    const utxos = await getUTXOs(apiUrl, fromAddress, minConfirmations);

    if (!utxos || utxos.length === 0) {
        throw new Error('No UTXOs found for address');
    }

    // Calculate total input value
    const totalInput = utxos.reduce((sum, utxo) => sum + utxo.value, 0);

    if (totalInput === 0) {
        throw new Error('Total UTXO value is zero');
    }

    // Get or estimate fee rate
    const feeRate = customFeeRate || await estimateFee(apiUrl);

    // Calculate transaction size (inputs + 1 output)
    const txSize = calculateTxSize(utxos.length, 1);

    // Calculate fee with buffer
    const baseFee = feeRate * txSize;
    const feeWithBuffer = Math.ceil(baseFee * feeBuffer);

    let amountToSend;
    let requestedAmount = parseInt(amount);

    if (feesInclusive) {
        // Sweep all: send everything minus fees
        amountToSend = totalInput - feeWithBuffer;

        if (amountToSend <= 0) {
            throw new Error(
                `Insufficient balance to cover transaction fees. ` +
                `Input: ${totalInput} sat, Fee: ${feeWithBuffer} sat`
            );
        }
    } else {
        // Normal transfer: validate requested amount
        if (requestedAmount <= 0) {
            throw new Error(`Invalid amount: ${amount}`);
        }

        const totalRequired = requestedAmount + feeWithBuffer;

        if (totalInput < totalRequired) {
            throw new Error(
                `Insufficient balance. Balance: ${totalInput} sat, ` +
                `Required: ${totalRequired} sat (${requestedAmount} + ${feeWithBuffer} fee)`
            );
        }

        amountToSend = requestedAmount;
    }

    // Check dust limit
    if (amountToSend < DUST_LIMIT) {
        throw new Error(
            `Output below dust limit (${DUST_LIMIT} sat). Amount: ${amountToSend} sat`
        );
    }

    // Create transaction using PSBT
    const psbt = new bitcoin.Psbt({ network: BITCOIN_NETWORK });

    // Add inputs from UTXOs
    for (const utxo of utxos) {
        try {
            const txHex = await $fetch(`${apiUrl}/tx/${utxo.txid}/hex`, {
                timeout: 10000
            });

            psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                nonWitnessUtxo: Buffer.from(txHex, 'hex')
            });
        } catch (inputError) {
            throw new Error(`Failed to add UTXO ${utxo.txid}:${utxo.vout} - ${inputError.message}`);
        }
    }

    // Add output to recipient
    psbt.addOutput({
        address: toAddress,
        value: BigInt(amountToSend)
    });

    // Create signing key pair
    const keyPair = createKeyPair(mnemonic, derivationPath);

    // Sign all inputs
    try {
        for (let i = 0; i < utxos.length; i++) {
            psbt.signInput(i, keyPair);
        }
    } catch (signError) {
        throw new Error(`Failed to sign transaction: ${signError.message}`);
    }

    // Validate signatures
    try {
        psbt.validateSignaturesOfAllInputs((pubkey, msghash, signature) =>
            ecc.verify(msghash, pubkey, signature)
        );
    } catch (validationError) {
        throw new Error(`Signature validation failed: ${validationError.message}`);
    }

    // Finalize and extract transaction
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();
    const txId = tx.getId();
    const actualTxSize = tx.virtualSize();
    const actualFeeRate = parseFloat((feeWithBuffer / actualTxSize).toFixed(2));

    console.log(
        `[btcTransfer] Transaction created. Size: ${actualTxSize} vB, ` +
        `Fee: ${feeWithBuffer} sat, Fee rate: ${actualFeeRate} sat/vB`
    );

    // Broadcast transaction
    let txHash;
    try {
        txHash = await broadcastTransaction(apiUrl, txHex);

        // Verify broadcasted txid matches computed txid
        if (txHash !== txId) {
            console.warn(
                `[btcTransfer] Warning: Broadcasted txid (${txHash}) differs from computed txid (${txId})`
            );
        }
    } catch (broadcastError) {
        throw new Error(`Failed to broadcast transaction: ${broadcastError.message}`);
    }

    return {
        txHash: txHash,
        actualAmount: amountToSend,
        fee: feeWithBuffer,
        feeRate: actualFeeRate,
        txSize: actualTxSize,
        tx: tx
    };
}

/**
 * Helper: Get Bitcoin address balance
 */
export async function getBitcoinBalance(apiUrl, address) {
    try {
        const response = await $fetch(`${apiUrl}/address/${address}`, {
            timeout: 10000
        });

        // Get confirmed balance in satoshis
        const balanceSat = response.chain_stats?.funded_txo_sum - response.chain_stats?.spent_txo_sum || 0;

        return balanceSat;

    } catch (error) {
        console.error(`[getBitcoinBalance] Error fetching balance for ${address}:`, error.message);
        throw error;
    }
}

/**
 * Helper: Get Bitcoin balance in BTC (human-readable)
 */
export async function getBitcoinBalanceBTC(apiUrl, address) {
    const balanceSat = await getBitcoinBalance(apiUrl, address);
    return (balanceSat / 1e8).toString();
}