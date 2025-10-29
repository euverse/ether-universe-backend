import { ethers } from 'ethers';

/**
 * Calculate estimated gas cost for an ERC-20 token transfer
 * 
 * @param {ethers.Provider} provider - Ethers provider instance
 * @param {BigInt} [gasLimit=65000n] - Optional custom gas limit
 * @returns {Promise<BigInt>} Estimated gas cost in wei (with 20% buffer)
 */
export async function calculateGasForERC20Transfer(provider, gasLimit = BigInt(65000)) {
    const feeData = await provider.getFeeData();

    let gasCost;
    if (feeData.maxFeePerGas) {
        gasCost = feeData.maxFeePerGas * gasLimit;
    } else {
        gasCost = feeData.gasPrice * gasLimit;
    }

    // Apply 20% buffer
    return (gasCost * BigInt(120)) / BigInt(100);
}

/**
 * Agnostic EVM transfer function
 * Handles both native tokens (ETH) and ERC-20 tokens with automatic gas calculation
 * 
 * @param {Object} params - Transfer parameters
 * @param {ethers.Provider} params.provider - Ethers provider instance
 * @param {ethers.Wallet} params.signer - Wallet signer instance
 * @param {string} params.toAddress - Recipient address
 * @param {string} params.amount - Amount to transfer in smallest units (wei for ETH, token units for ERC-20)
 * @param {Object} [params.tokenConfig] - Optional token configuration for ERC-20 transfers
 * @param {string} params.tokenConfig.address - Token contract address
 * @param {number} params.tokenConfig.decimals - Token decimals (for validation/logging)
 * @param {boolean} [params.deductGasFromAmount=false] - For native tokens: deduct gas from amount (useful for sweeping full balance)
 * @param {BigInt} [params.gasLimit] - Optional custom gas limit
 * 
 * @returns {Promise<Object>} Transaction result
 * @returns {string} result.txHash - Transaction hash
 * @returns {string} result.actualAmount - Actual amount transferred (after gas deduction if applicable)
 * @returns {string} result.gasCost - Gas cost in wei
 * @returns {Object} result.receipt - Full transaction receipt
 * 
 * @throws {Error} If transfer fails or validation fails
 */
export async function evmTransfer({
    provider,
    signer,
    toAddress,
    amount,
    tokenConfig = null,
    deductGasFromAmount = false,
    gasLimit = null
}) {
    // Validate inputs
    if (!provider || !signer || !toAddress || !amount) {
        throw new Error('Missing required parameters: provider, signer, toAddress, and amount are required');
    }

    if (!ethers.isAddress(toAddress)) {
        throw new Error(`Invalid recipient address: ${toAddress}`);
    }

    const amountBigInt = BigInt(amount);
    if (amountBigInt <= BigInt(0)) {
        throw new Error(`Invalid amount: ${amount}`);
    }

    const fromAddress = await signer.getAddress();

    // === NATIVE TOKEN TRANSFER (ETH, MATIC, etc.) ===
    if (!tokenConfig) {
        // Get current balance
        const balance = await provider.getBalance(fromAddress);

        // Get fee data
        const feeData = await provider.getFeeData();
        const gasLimitNative = gasLimit || BigInt(21000);

        // Calculate gas cost with buffer (using BigInt arithmetic to avoid precision loss)
        let gasCost;
        if (feeData.maxFeePerGas) {
            // EIP-1559 transaction
            gasCost = feeData.maxFeePerGas * gasLimitNative;
        } else {
            // Legacy transaction
            gasCost = feeData.gasPrice * gasLimitNative;
        }

        // Apply buffer using BigInt arithmetic: multiply by 120, divide by 100
        gasCost = (gasCost * BigInt(120)) / BigInt(100);

        let amountToSend;

        if (deductGasFromAmount) {
            // Deduct gas from amount (for full balance sweeps)
            if (balance < amountBigInt) {
                throw new Error(
                    `Insufficient balance. Balance: ${ethers.formatEther(balance)} ETH, ` +
                    `Requested: ${ethers.formatEther(amountBigInt)} ETH`
                );
            }

            amountToSend = amountBigInt - gasCost;

            if (amountToSend <= BigInt(0)) {
                throw new Error(
                    `Insufficient balance to cover gas fees. Balance: ${ethers.formatEther(amountBigInt)} ETH, ` +
                    `Gas cost: ${ethers.formatEther(gasCost)} ETH`
                );
            }
        } else {
            // Check if balance covers amount + gas
            const totalRequired = amountBigInt + gasCost;
            if (balance < totalRequired) {
                throw new Error(
                    `Insufficient balance. Balance: ${ethers.formatEther(balance)} ETH, ` +
                    `Required: ${ethers.formatEther(totalRequired)} ETH (${ethers.formatEther(amountBigInt)} + ${ethers.formatEther(gasCost)} gas)`
                );
            }

            amountToSend = amountBigInt;
        }

        // Build transaction parameters
        const txParams = {
            to: toAddress,
            value: amountToSend,
            gasLimit: gasLimitNative
        };

        // Add EIP-1559 or legacy gas pricing
        if (feeData.maxFeePerGas) {
            txParams.maxFeePerGas = feeData.maxFeePerGas;
            txParams.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        } else {
            txParams.gasPrice = feeData.gasPrice;
        }

        // Send transaction
        const tx = await signer.sendTransaction(txParams);
        const receipt = await tx.wait();

        return {
            txHash: receipt.hash,
            actualAmount: amountToSend.toString(),
            gasCost: gasCost.toString(),
            receipt
        };
    }

    // === ERC-20 TOKEN TRANSFER ===
    else {
        const { address: tokenAddress, decimals } = tokenConfig;

        if (!ethers.isAddress(tokenAddress)) {
            throw new Error(`Invalid token address: ${tokenAddress}`);
        }

        if (!decimals || decimals < 0) {
            throw new Error(`Invalid token decimals: ${decimals}`);
        }

        // Check wallet has enough ETH for gas
        const ethBalance = await provider.getBalance(fromAddress);
        const estimatedGasLimit = gasLimit || BigInt(65000);
        const estimatedGasCost = await calculateGasForERC20Transfer(provider, estimatedGasLimit);

        if (ethBalance < estimatedGasCost) {
            throw new Error(
                `Insufficient ETH for gas. Balance: ${ethers.formatEther(ethBalance)} ETH, ` +
                `Estimated gas cost: ${ethers.formatEther(estimatedGasCost)} ETH`
            );
        }

        // Check token balance
        const tokenContract = new ethers.Contract(
            tokenAddress,
            [
                'function balanceOf(address) view returns (uint256)',
                'function transfer(address to, uint256 amount) returns (bool)'
            ],
            signer
        );

        const tokenBalance = await tokenContract.balanceOf(fromAddress);

        if (tokenBalance < amountBigInt) {
            throw new Error(
                `Insufficient token balance. Balance: ${ethers.formatUnits(tokenBalance, decimals)}, ` +
                `Requested: ${ethers.formatUnits(amountBigInt, decimals)}`
            );
        }

        // Execute transfer
        const tx = await tokenContract.transfer(toAddress, amountBigInt);
        const receipt = await tx.wait();

        // Calculate actual gas cost
        const actualGasCost = receipt.gasUsed * (receipt.effectiveGasPrice || receipt.gasPrice);

        return {
            txHash: receipt.hash,
            actualAmount: amount, // For ERC-20, amount transferred equals requested amount
            gasCost: actualGasCost.toString(),
            receipt
        };
    }
}

/**
 * Helper: Create signer from mnemonic and derivation path
 * 
 * @param {string} mnemonic - BIP39 mnemonic phrase
 * @param {string} derivationPath - HD wallet derivation path (e.g., "m/44'/60'/0'/0/0")
 * @param {ethers.Provider} provider - Ethers provider instance
 * @returns {ethers.Wallet} Connected wallet signer
 * @throws {Error} If mnemonic is invalid or derivation fails
 */
export function createSignerFromMnemonic(mnemonic, derivationPath, provider) {
    if (!mnemonic) {
        throw new Error('Mnemonic is required');
    }
    if (!derivationPath) {
        throw new Error('Derivation path is required');
    }
    if (!provider) {
        throw new Error('Provider is required');
    }

    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, "m");
    return hdNode.derivePath(derivationPath).connect(provider);
}

/**
 * Helper: Get provider for network
 * 
 * @param {string} rpcUrl - RPC endpoint URL
 * @returns {ethers.JsonRpcProvider} Provider instance
 * @throws {Error} If RPC URL is invalid
 */
export function createProvider(rpcUrl) {
    if (!rpcUrl) {
        throw new Error('RPC URL is required');
    }

    // Validate URL format
    try {
        new URL(rpcUrl);
    } catch (error) {
        throw new Error(`Invalid RPC URL format: ${rpcUrl}`);
    }

    return new ethers.JsonRpcProvider(rpcUrl);
}