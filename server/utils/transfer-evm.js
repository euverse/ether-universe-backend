import { ethers } from 'ethers';

/**
 * Gas buffer multiplier for native token transfers (20% buffer)
 */
const GAS_BUFFER_MULTIPLIER = 1.2;

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
    if (amountBigInt <= 0n) {
        throw new Error(`Invalid amount: ${amount}`);
    }

    const fromAddress = await signer.getAddress();

    // === NATIVE TOKEN TRANSFER (ETH, MATIC, etc.) ===
    if (!tokenConfig) {
        // Get current balance
        const balance = await provider.getBalance(fromAddress);

        // Get fee data
        const feeData = await provider.getFeeData();
        const gasLimitNative = gasLimit || 21000n;

        // Calculate gas cost with buffer
        let gasCost;
        if (feeData.maxFeePerGas) {
            // EIP-1559 transaction
            gasCost = feeData.maxFeePerGas * gasLimitNative;
        } else {
            // Legacy transaction
            gasCost = feeData.gasPrice * gasLimitNative;
        }

        // Apply buffer
        gasCost = BigInt(Math.ceil(Number(gasCost) * GAS_BUFFER_MULTIPLIER));

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

            if (amountToSend <= 0n) {
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

        // Check wallet has enough ETH for gas
        const ethBalance = await provider.getBalance(fromAddress);
        const feeData = await provider.getFeeData();

        // Estimate gas for ERC-20 transfer (typically ~65000)
        const estimatedGasLimit = gasLimit || 65000n;

        let estimatedGasCost;
        if (feeData.maxFeePerGas) {
            estimatedGasCost = feeData.maxFeePerGas * estimatedGasLimit;
        } else {
            estimatedGasCost = feeData.gasPrice * estimatedGasLimit;
        }

        estimatedGasCost = BigInt(Math.ceil(Number(estimatedGasCost) * GAS_BUFFER_MULTIPLIER));

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
 */
export function createSignerFromMnemonic(mnemonic, derivationPath, provider) {
    const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
    const hdNode = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, "m");
    return hdNode.derivePath(derivationPath).connect(provider);
}

/**
 * Helper: Get provider for network
 */
export function createProvider(rpcUrl) {
    if (!rpcUrl) {
        throw new Error('RPC URL is required');
    }
    return new ethers.JsonRpcProvider(rpcUrl);
}