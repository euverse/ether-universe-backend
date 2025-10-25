import { Schema } from "mongoose";
import { NETWORKS } from "./Network";

export const DEPOSIT_STATUS = {
  PENDING: 'pending',      // Detected on-chain, ready to be swept
  PROCESSING: 'processing', // Currently being swept (prevents concurrent sweeps)
  SWEPT: 'swept',          // Successfully swept to admin wallet
  FAILED: 'failed'         // Failed to sweep (will be retried)
};

const depositSchema = new Schema({
  tradingAccount: {
    type: Schema.Types.ObjectId,
    ref: 'TradingAccount',
    required: true
  },
  wallet: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true
  },
  balance: {
    type: Schema.Types.ObjectId,
    ref: 'Balance',
    required: true
  },
  network: {
    type: String,
    enum: Object.values(NETWORKS),
    required: true
  },
  pair: {
    type: Schema.Types.ObjectId,
    ref: 'Pair',
    required: true
  },

  // Deposit amounts - detected on-chain
  amount: {
    type: String,
    required: true
  },
  amountSmallest: {
    type: String,
    required: true
  },

  // Status tracking
  status: {
    type: String,
    enum: Object.values(DEPOSIT_STATUS),
    default: DEPOSIT_STATUS.PENDING,
    required: true
  },

  // Sweep tracking - for successful sweeps
  sweptAt: Date,
  sweepTxHash: {
    type: String,
    lowercase: true
  },
  sweptToAdminWallet: {
    type: Schema.Types.ObjectId,
    ref: 'AdminWallet'
  },

  // Actual swept amounts (may differ from detected amount due to gas/fees)
  actualSweptAmount: String,              // Human-readable
  actualSweptAmountSmallest: String,      // In smallest units

  // Fee tracking (especially important for Bitcoin)
  sweepFee: Number,          // Fee in smallest units (wei/satoshi)
  sweepFeeRate: Number,      // For Bitcoin: sat/vB, For EVM: gwei

  // Failure tracking - for retry mechanism
  failureReason: String,
  failedAt: Date,
  retryCount: {
    type: Number,
    default: 0
  },

  // Critical error flag - for accounting mismatches
  accountingError: String,   // Set when sweep succeeds but accounting fails

}, {
  timestamps: true
});

// Indexes - optimized for balance-based scanning and sweep operations
depositSchema.index({ wallet: 1, pair: 1, network: 1, status: 1 });  // For getPendingDepositAmount
depositSchema.index({ status: 1, network: 1 });                       // For sweeping operations
depositSchema.index({ status: 1, retryCount: 1, failedAt: 1 });      // For retry mechanism
depositSchema.index({ tradingAccount: 1, status: 1 });                // For user queries
depositSchema.index({ wallet: 1, pair: 1, network: 1, amountSmallest: 1, createdAt: -1 }); // For duplicate detection

export default depositSchema;