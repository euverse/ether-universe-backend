import { ethers } from 'ethers';

const Transaction = getModel('Transaction');
const Wallet = getModel('Wallet');
const Balance = getModel('Balance');

const providers = {
  ethereum: new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL),
  bsc: new ethers.JsonRpcProvider(process.env.BSC_RPC_URL),
  polygon: new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL)
};

/**
 * Check for new deposits on EVM chains
 */
export async function checkEVMDeposits(network) {
  const provider = providers[network];
  const wallets = await Wallet.find({ network });
  
  for (const wallet of wallets) {
    try {
      // Get current balance
      const currentBalance = await provider.getBalance(wallet.address);
      const currentBalanceEth = ethers.formatEther(currentBalance);
      
      // Get last known balance from database
      const lastTransaction = await Transaction.findOne({
        wallet: wallet._id,
        type: 'deposit'
      }).sort({ createdAt: -1 });
      
      const lastKnownBalance = lastTransaction?.balanceAfter || '0';
      
      // If balance increased = new deposit!
      if (parseFloat(currentBalanceEth) > parseFloat(lastKnownBalance)) {
        const depositAmount = parseFloat(currentBalanceEth) - parseFloat(lastKnownBalance);
        
        // Record deposit transaction
        await Transaction.create({
          user: wallet.userId,
          wallet: wallet._id,
          network,
          type: 'deposit',
          amount: depositAmount.toString(),
          balanceAfter: currentBalanceEth,
          status: 'completed',
          txHash: null // Could fetch actual tx hash by scanning recent blocks
        });
        
        // Update user's internal balance
        await Balance.findOneAndUpdate(
          { userId: wallet.userId, asset: network === 'ethereum' ? 'ETH' : network.toUpperCase() },
          { $inc: { balance: depositAmount } },
          { upsert: true }
        );
                
      }
    } catch (error) {
      console.error(`Error checking deposits for ${wallet.address}:`, error);
    }
  }
}

/**
 * Check ERC-20 token deposits
 */
export async function checkERC20Deposits(
  network,
  tokenAddress,
  pair,
  decimals
) {
  const provider = providers[network.id];
  const wallets = await Wallet.find({ network:network._id });
  
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  
  for (const wallet of wallets) {
    try {
      const balance = await tokenContract.balanceOf(wallet.address);
      const balanceFormatted = ethers.formatUnits(balance, decimals);
      
      // Get last known balance
      const lastTransaction = await Transaction.findOne({
        walletId: wallet._id,
        type: 'deposit',
        tokenAddress
      }).sort({ createdAt: -1 });
      
      const lastKnownBalance = lastTransaction?.balanceAfter || '0';
      
      if (parseFloat(balanceFormatted) > parseFloat(lastKnownBalance)) {
        const depositAmount = parseFloat(balanceFormatted) - parseFloat(lastKnownBalance);
        
        await Transaction.create({
          wallet: wallet._id,
          network: network._id,
          type: 'deposit',
          amount: depositAmount.toString(),
          pair: pair._id,
          tokenAddress: tokenAddress,
          balanceAfter: balanceFormatted,
          status: 'completed'
        });
        
        await Balance.findOneAndUpdate(
          { userId: wallet.userId, asset: pair },
          { $inc: { balance: depositAmount } },
          { upsert: true }
        );
        
      }
    } catch (error) {
      console.error(`Error checking token deposits:`, error);
    }
  }
}