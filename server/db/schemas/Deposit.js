// ============================================
// SIMPLIFIED DEPOSIT SCHEMA (Balance-Based)
// ============================================
import { Schema } from "mongoose";
import { NETWORKS } from "./Network";

export const DEPOSIT_STATUS = {
  PENDING: 'pending',    // Detected on-chain, ready to be swept
  SWEPT: 'swept',        // Funds swept to admin wallet
  FAILED: 'failed'       // Failed to sweep
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
  // Amount in human-readable format (e.g., "10.5" ETH)
  amount: {
    type: String,
    required: true
  },
  // Amount in smallest units (wei/satoshi) - for calculations
  amountSmallest: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(DEPOSIT_STATUS),
    default: DEPOSIT_STATUS.PENDING
  },
  // Sweep tracking
  sweptAt: Date,
  sweepTxHash: {
    type: String,
    lowercase: true
  },
  sweptToAdminWallet: {
    type: Schema.Types.ObjectId,
    ref: 'AdminWallet'
  },
  // Failure tracking
  failedReason: String,
  failedAt: Date,
  // Detection timestamp
  detectedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes - optimized for balance-based scanning
depositSchema.index({ wallet: 1, network: 1, pair: 1, status: 1 });
depositSchema.index({ status: 1, createdAt: -1 });
depositSchema.index({ tradingAccount: 1, status: 1 });

export default depositSchema;