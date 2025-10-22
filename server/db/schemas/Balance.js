import { Schema } from "mongoose";
import { NETWORKS } from "./Network";

const balanceSchema = new Schema({
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
    //initial balance
    initial: {
        type: String,
        default: '0'
    },
    // Available for trading & withdrawing
    available: {
        type: String,
        default: '0'
    },
    // Locked in open orders
    locked: {
        type: String,
        default: '0'
    },
    // Lifetime stats
    totalDeposited: {
        type: String,
        default: '0'
    },
    // Lifetime stats
    totalAllocated: {
        type: String,
        default: '0'
    },
    totalWithdrawn: {
        type: String,
        default: '0'
    },
    lastDepositAt: Date,
    lastWithdrawalAt: Date,
    lastOnchainSyncAt: Date
}, {
    timestamps: true
});

balanceSchema.index({ wallet: 1, pair: 1, network: 1 }, { unique: true });
balanceSchema.index({ wallet: 1 });
balanceSchema.index({ pair: 1, network: 1 });

// Virtual: total balance
balanceSchema.virtual('total').get(function () {
    const available = parseFloat(this.available || '0');
    const locked = parseFloat(this.locked || '0');
    return (available + locked).toString();
});

balanceSchema.set('toObject', { virtuals: true });
balanceSchema.set('toJSON', { virtuals: true });

export default balanceSchema;

