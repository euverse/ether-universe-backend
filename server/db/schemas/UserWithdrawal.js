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

export const WITHDRAWAL_TYPES = {
    USER: 'user',
    ADMIN: 'admin'
};

const userWithdrawalSchema = new Schema({
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
    pair: {
        type: Schema.Types.ObjectId,
        ref: 'Pair',
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
    recipientAddress: {
        type: String,
        required: true
    },
    // Blockchain transaction
    txHash: {
        type: String
    },
    // Status
    status: {
        type: String,
        enum: Object.values(WITHDRAWAL_STATUSES),
        default: WITHDRAWAL_STATUSES.PENDING
    },
    // Store locked balance distributions (in smallest units for settlement)
    lockedDistributions: [{
        balanceId: {
            type: Schema.Types.ObjectId,
            ref: 'Balance'
        },
        network: String,
        amount: String // Stored in smallest units (wei/satoshi)
    }],
    // Admin approval (required for user withdrawals)
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
    reviewedAt: {
        type: Date
    },
    processedAt: {
        type: Date
    },
    completedAt: {
        type: Date
    },

}, {
    timestamps: true
});

userWithdrawalSchema.index({ user: 1, status: 1 });
userWithdrawalSchema.index({ wallet: 1, status: 1 });
userWithdrawalSchema.index({ tradingAccount: 1, status: 1 });
userWithdrawalSchema.index({ txHash: 1 });
userWithdrawalSchema.index({ status: 1, createdAt: -1 });


export default userWithdrawalSchema;