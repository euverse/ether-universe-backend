import { WITHDRAWAL_STATUSES, WITHDRAWAL_TYPES } from '~/db/schemas/UserWithdrawal.js';
import { CHAIN_TYPES, NETWORKS } from '../db/schemas/Network.js';
import { ACCOUNT_TYPES } from '../db/schemas/TradingAccount.js';
import { lockAssetBalances, unlockBalance } from './user-balances.js';

const UserWithdrawal = getModel('UserWithdrawal');
const AdminWithdrawal = getModel('AdminWithdrawal');
const Pair = getModel('Pair');
const Wallet = getModel('Wallet');
const AdminWallet = getModel('AdminWallet');
const TradingAccount = getModel('TradingAccount');

// CREATE USER WITHDRAWAL
/**
 * Create a user withdrawal request
 * Status: PENDING (requires admin approval)
 * Balances: NOT deducted yet (deducted on approval)
 */
export async function createUserWithdrawal({
  userId,
  baseAsset,
  network,
  amount, // human-readable
  recipientAddress,
}) {
  // Validate pair
  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw new Error(`Pair ${baseAsset} not found`);
  }

  if (!pair.isActive) {
    throw new Error(`Pair ${baseAsset} is not active`);
  }


  // Validate network
  if (!pair.networks.includes(network)) {
    throw new Error(`Network ${network} not supported for ${baseAsset}`);
  }

  const realTradingAccount = await TradingAccount.findOne({
    user: userId,
    type: ACCOUNT_TYPES.REAL
  })

  if (!realTradingAccount) {
    throw Error("User does not have a real trading account")
  }

  const tradingAccountId = realTradingAccount._id


  const PAIR_CHAINS = {
    USDT: CHAIN_TYPES.EVM,
    ETH: CHAIN_TYPES.EVM,
    BTC: CHAIN_TYPES.BTC
  }

  const chainType = PAIR_CHAINS[pair.baseAsset]

  const wallet = await Wallet.findOne({
    tradingAccount: tradingAccountId,
    chainType
  });

  if (!wallet) {
    throw new Error('Wallet not found or does not belong to trading account');
  }

  const walletId = wallet._id;

  const amountUsd = pair.valueUsd * amount

  //lock balances to prevent multiple withdraw requests
  const { distributions: lockedDistributions } = await lockAssetBalances(realTradingAccount._id, baseAsset, amount, network)


  // Create withdrawal
  const withdrawal = await UserWithdrawal.create({
    user: userId,
    tradingAccount: tradingAccountId,
    wallet: walletId,
    pair: pair._id,
    network,
    requestedAmount: amount,
    requestedAmountUsd: amountUsd,
    recipientAddress,
    status: WITHDRAWAL_STATUSES.PENDING,
    lockedDistributions
  });

  return withdrawal;
}

// APPROVE USER WITHDRAWAL
/**
 * Approve user withdrawal
 * - Deducts user balance
 * - Deducts admin balance
 * - Initiates blockchain transaction
 * - Updates status to PROCESSING
 */
export async function approveUserWithdrawal(withdrawalId, adminId) {
  const withdrawal = await UserWithdrawal.findById(withdrawalId)
    .populate('pair')
    .populate('wallet');

  if (!withdrawal) {
    throw new Error('Withdrawal not found');
  }

  if (withdrawal.status !== WITHDRAWAL_STATUSES.PENDING) {
    throw new Error(`Cannot approve withdrawal with status: ${withdrawal.status}`);
  }

  const { pair, tradingAccount, network, requestedAmount, recipientAddress } = withdrawal;

  try {
    //unlock user locked balance
    await unlockBalance(withdrawal.pair.baseAsset, withdrawal.lockedDistributions)

    // Step 1: Deduct user balance
    await removeWithdrawal(
      tradingAccount,
      pair.baseAsset,
      requestedAmount,
      network
    );

    // Step 2: Deduct admin balance
    await deductAdminBalance(
      pair.baseAsset,
      requestedAmount,
      WITHDRAWAL_TYPES.USER,
      network
    );

    // Step 3: Initiate blockchain transaction
    const txResult = await executeBlockchainWithdrawal({
      pair,
      network: withdrawal.network,
      amount: requestedAmount,
      recipientAddress
    });

    // Step 4: Update withdrawal
    withdrawal.status = WITHDRAWAL_STATUSES.PROCESSING;
    withdrawal.reviewedBy = adminId;
    withdrawal.reviewedAt = new Date();
    withdrawal.processedAt = new Date();
    withdrawal.txHash = txResult.txHash;
    withdrawal.fee = txResult.fee || '0';

    await withdrawal.save();

    return withdrawal;

  } catch (error) {
    // If blockchain transaction fails, withdrawal remains PENDING
    // Balances are already deducted, so admin needs to handle manually
    throw new Error(`Withdrawal approval failed: ${error.message}`);
  }
}

// REJECT USER WITHDRAWAL
/**
 * Reject user withdrawal
 * - No balance deductions
 * - Updates status to REJECTED
 */
export async function rejectUserWithdrawal(
  withdrawalId,
  adminId,
  rejectionReason,
  rejectionDetails = []
) {
  const withdrawal = await UserWithdrawal.findById(withdrawalId)
    .populate("pair");

  if (!withdrawal) {
    throw new Error('Withdrawal not found');
  }

  if (withdrawal.status !== WITHDRAWAL_STATUSES.PENDING) {
    throw new Error(`Cannot reject withdrawal with status: ${withdrawal.status}`);
  }

  //unlock user locked balance
  await unlockBalance(withdrawal.pair.baseAsset, withdrawal.lockedDistributions)

  withdrawal.status = WITHDRAWAL_STATUSES.REJECTED;
  withdrawal.reviewedBy = adminId;
  withdrawal.reviewedAt = new Date();
  withdrawal.rejectionReason = rejectionReason;
  withdrawal.rejectionDetails = rejectionDetails;

  await withdrawal.save();

  return withdrawal;
}

// CREATE ADMIN WITHDRAWAL
/**
 * Create an admin withdrawal
 * Status: PROCESSING (auto-approved)
 * Balances: Deducted immediately
 */
export async function createAdminWithdrawal({
  adminId,
  adminWalletId,
  baseAsset,
  network,
  amount, // human-readable
  recipientAddress,
  purpose = null,
  notes = null,
}) {
  // Validate pair
  const pair = await Pair.findOne({ baseAsset });
  if (!pair) {
    throw new Error(`Pair ${baseAsset} not found`);
  }

  if (!pair.isActive) {
    throw new Error(`Pair ${baseAsset} is not active.`);
  }


  // Validate admin wallet
  const adminWallet = await AdminWallet.findById(adminWalletId);
  if (!adminWallet) {
    throw new Error('Admin wallet not found');
  }


  if (['USDT', 'ETH', 'BTC'].includes())

    // Validate network
    if (!pair.networks.includes(network)) {
      throw new Error(`Network ${network} not supported for ${baseAsset}`);
    }

  try {
    // Step 1: Deduct admin balance
    await deductAdminBalance(
      baseAsset,
      amount,
      WITHDRAWAL_TYPES.ADMIN,
      network
    );

    // Step 2: Initiate blockchain transaction
    const txResult = await executeBlockchainWithdrawal({
      pair,
      network,
      amount,
      recipientAddress,
      isAdminWithdrawal: true
    });

    // Step 3: Create withdrawal record
    const withdrawal = await AdminWithdrawal.create({
      initiatedBy: adminId,
      adminWallet: adminWalletId,
      pair: pair._id,
      network,
      requestedAmount: amount,
      requestedAmountUsd: pair.valueUsd * amount,
      recipientAddress,
      purpose,
      notes,
      status: WITHDRAWAL_STATUSES.PROCESSING,
      txHash: txResult.txHash,
      fee: txResult.fee || '0',
      processedAt: new Date()
    });

    return withdrawal;

  } catch (error) {
    throw new Error(`Admin withdrawal failed: ${error.message}`);
  }
}

const rpcUrls = useRuntimeConfig().rpcUrls;

// RPC endpoints
const RPC_ENDPOINTS = {
  [NETWORKS.ETHEREUM]: rpcUrls.ethereum,
  [NETWORKS.POLYGON]: rpcUrls.polygon,
  [NETWORKS.BITCOIN]: rpcUrls.btc
};


// EXECUTE BLOCKCHAIN WITHDRAWAL

/**
 * Execute blockchain transaction based on chain type
 */
async function executeBlockchainWithdrawal({
  pair,
  network,
  amount,
  recipientAddress
}) {
  const chainType = getChainType(network);

  if (chainType === CHAIN_TYPES.EVM) {
    return await executeEvmWithdrawal({
      pair,
      network,
      amount,
      recipientAddress,
    });
  } else if (chainType === CHAIN_TYPES.BITCOIN) {
    return await executeBtcWithdrawal({
      pair,
      network,
      amount,
      recipientAddress
    });
  } else {
    throw new Error(`Unsupported chain type: ${chainType}`);
  }
}

// EXECUTE EVM WITHDRAWAL
async function executeEvmWithdrawal({
  pair,
  network,
  amount,
  recipientAddress
}) {
  // Get admin wallet for this network
  const adminWallet = await AdminWallet.findOne({
    chainType: CHAIN_TYPES.EVM,
    isActive: true
  }).select('+derivationPath');

  if (!adminWallet) {
    throw new Error(`No active admin wallet found for evm`);
  }

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

  // Setup provider and signer
  const provider = getProvider(network);
  const adminSigner = createSignerFromMnemonic(
    process.env.MASTER_MNEMONIC,
    adminWallet.derivationPath,
    provider
  );

  // Convert amount to smallest unit
  const amountSmallest = toSmallestUnit(amount, pair.decimals);

  // Prepare transfer params
  const transferParams = {
    provider,
    signer: adminSigner,
    toAddress: recipientAddress,
    amount: amountSmallest
  };

  // Add token config if not native token
  if (pair.contractAddress) {
    transferParams.tokenConfig = {
      address: pair.contractAddress,
      decimals: pair.decimals
    };
  }

  // Execute transfer
  const result = await evmTransfer(transferParams);

  return {
    txHash: result.txHash,
    fee: result.gasCost
  };
}

// EXECUTE BTC WITHDRAWAL
async function executeBtcWithdrawal({
  amount,
  recipientAddress
}) {
  // Get admin wallet for this network
  const adminWallet = await AdminWallet.findOne({
    chainType: CHAIN_TYPES.BTC,
    isActive: true
  }).select('+derivationPath');

  if (!adminWallet) {
    throw new Error(`No active admin wallet found for Bitcoin`);
  }

  // Convert amount to satoshis
  const amountSatoshis = toSmallestUnit(amount, 8); // BTC has 8 decimals

  // Execute transfer
  const result = await btcTransfer({
    apiUrl: RPC_ENDPOINTS[NETWORKS.BITCOIN],
    fromAddress: adminWallet.address,
    toAddress: recipientAddress,
    mnemonic: adminWallet.mnemonic,
    derivationPath: adminWallet.derivationPath,
    amount: amountSatoshis
  });

  return {
    txHash: result.txHash,
    fee: result.fee.toString()
  };
}

// GET PENDING USER WITHDRAWALS
/**
 * Get all pending user withdrawals for admin review
 */
export async function getPendingUserWithdrawals(filters = {}) {
  const query = { status: WITHDRAWAL_STATUSES.PENDING };

  if (filters.userId) query.user = filters.userId;
  if (filters.network) query.network = filters.network;
  if (filters.baseAsset) {
    const pair = await Pair.findOne({ baseAsset: filters.baseAsset });
    if (pair) query.pair = pair._id;
  }

  const withdrawals = await UserWithdrawal.find(query)
    .populate('user', 'email username')
    .populate('pair', 'baseAsset symbol')
    .populate('wallet')
    .sort({ createdAt: 1 }); // Oldest first

  return withdrawals;
}

// GET USER WITHDRAWAL HISTORY
/**
 * Get withdrawal history for a user
 */
export async function getUserWithdrawalHistory(userId, filters = {}) {
  const query = { user: userId };

  if (filters.status) query.status = filters.status;
  if (filters.network) query.network = filters.network;
  if (filters.baseAsset) {
    const pair = await Pair.findOne({ baseAsset: filters.baseAsset });
    if (pair) query.pair = pair._id;
  }

  const withdrawals = await UserWithdrawal.find(query)
    .populate('pair', 'baseAsset symbol')
    .populate('wallet')
    .populate('reviewedBy', 'email username')
    .sort({ createdAt: -1 }); // Newest first

  return withdrawals;
}

// GET ADMIN WITHDRAWAL HISTORY
/**
 * Get withdrawal history for admin
 */
export async function getAdminWithdrawalHistory(filters = {}) {
  const query = {};

  if (filters.status) query.status = filters.status;
  if (filters.network) query.network = filters.network;
  if (filters.baseAsset) {
    const pair = await Pair.findOne({ baseAsset: filters.baseAsset });
    if (pair) query.pair = pair._id;
  }
  if (filters.initiatedBy) query.initiatedBy = filters.initiatedBy;

  const withdrawals = await AdminWithdrawal.find(query)
    .populate('pair', 'baseAsset symbol')
    .populate('adminWallet')
    .populate('initiatedBy', 'email username')
    .sort({ createdAt: -1 }); // Newest first

  return withdrawals;
}

// HELPER FUNCTIONS

/**
 * Get chain type from network
 */
function getChainType(network) {
  const networkConfig = {
    [NETWORKS.ETHEREUM]: CHAIN_TYPES.EVM,
    [NETWORKS.POLYGON]: CHAIN_TYPES.EVM,
    [NETWORKS.BITCOIN]: CHAIN_TYPES.BITCOIN,
    // Add more networks as needed
  };

  return networkConfig[network];
}