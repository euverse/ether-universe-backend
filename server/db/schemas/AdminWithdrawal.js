import { Schema } from "mongoose";
import { WITHDRAWAL_STATUSES } from "./UserWithdrawal";
import { NETWORKS } from "./Network";

const adminWithdrawalSchema = new Schema({
    initiatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    adminWallet: {
        type: Schema.Types.ObjectId,
        ref: 'AdminWallet',
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
    // Purpose/notes
    purpose: {
        type: String
    },
    notes: {
        type: String
    },
    // Blockchain transaction
    txHash: {
        type: String
    },
    // Status (auto-approved, no pending state)
    status: {
        type: String,
        enum: [
            WITHDRAWAL_STATUSES.PROCESSING,
            WITHDRAWAL_STATUSES.COMPLETED,
            WITHDRAWAL_STATUSES.FAILED
        ],
        default: WITHDRAWAL_STATUSES.PROCESSING
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
    // Timestamps
    processedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date
    }
}, {
    timestamps: true
});

adminWithdrawalSchema.index({ initiatedBy: 1, status: 1 });
adminWithdrawalSchema.index({ adminWallet: 1, status: 1 });
adminWithdrawalSchema.index({ txHash: 1 });
adminWithdrawalSchema.index({ status: 1, createdAt: -1 });

export default adminWithdrawalSchema;