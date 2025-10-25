import { Schema } from 'mongoose';

const assetAllocationSchema = new Schema(
    {
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
        pair: {
            type: Schema.Types.ObjectId,
            ref: 'TradingPair',
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        expiresAt: {
            type: Date,
            default: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }
    },
    {
        timestamps: true,
        toObject: { virtuals: true },
        toJSON: { virtuals: true }
    }
);

assetAllocationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

assetAllocationSchema.index({ user: 1, pair: 1 });

assetAllocationSchema.virtual('timeRemaining').get(function () {
    const remaining = this.expiresAt.getTime() - Date.now() || 0;
    return remaining;
});

export default assetAllocationSchema;