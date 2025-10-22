import { Schema } from 'mongoose';
import { NETWORKS } from './Network';

export const WITHDRAWAL_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

const withdrawalSchema = new Schema({
  withdrawalId: {
    type: String,
    required: true,
    unique: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
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
  tradingPair: {
    type: Schema.Types.ObjectId,
    ref: 'TradingPair',
    required: true
  },
  network: {
    type: String,
    enum: Object.values(NETWORKS),
    required: true
  },
  // Withdrawal details
  requestedAmount: {
    type: String,
    required: true
  },
  requestedAmountUsd: {
    type: String
  },
  fee: {
    type: String,
    default: '0'
  },
  netAmount: {
    type: String,
    required: true
  },
  toAddress: {
    type: String,
    required: true
  },
  // Blockchain transaction
  txHash: {
    type: String
  },
  blockNumber: {
    type: Number
  },
  // Status
  status: {
    type: String,
    enum: Object.values(WITHDRAWAL_STATUSES),
    default: WITHDRAWAL_STATUSES.PENDING
  },
  // Admin approval
  reviewedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Admin'
  },
  rejectionReason: {
    type: String
  },
  rejectionDetails: [{
    type: String
  }],
  // Timestamps
  requestedAt: {
    type: Date,
    default: Date.now
  },
  reviewedAt: {
    type: Date
  },
  processedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

withdrawalSchema.index({ user: 1, status: 1 });
withdrawalSchema.index({ wallet: 1, status: 1 });
withdrawalSchema.index({ status: 1, requestedAt: 1 });
withdrawalSchema.index({ txHash: 1 });

export default withdrawalSchema;