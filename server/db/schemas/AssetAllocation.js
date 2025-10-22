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
        pairId: {
            type: Schema.Types.ObjectId,
            ref: 'TradingPair',
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: ['active', 'expired', 'withdrawn'],
            default: 'active'
        },
        allocatedAt: {
            type: Date,
            default: Date.now
        },
        expiresAt: {
            type: Date,
            required: true
        },
        withdrawnAt: {
            type: Date
        },
        profitDuringPeriod: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

assetAllocationSchema.index({ user: 1, status: 1 });
assetAllocationSchema.index({ expiresAt: 1, status: 1 });

assetAllocationSchema.virtual('isActive').get(function() {
    return this.status === 'active' && this.expiresAt > new Date();
});

assetAllocationSchema.virtual('timeRemaining').get(function() {
    if (this.status !== 'active') return 0;
    const remaining = this.expiresAt.getTime() - Date.now();
    return remaining > 0 ? remaining : 0;
});

assetAllocationSchema.methods.getFormattedTimeRemaining = function() {
    const ms = this.timeRemaining;
    if (ms <= 0) return '00:00:00';
    
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

assetAllocationSchema.set('toObject', { virtuals: true });
assetAllocationSchema.set('toJSON', { virtuals: true });

export default assetAllocationSchema;