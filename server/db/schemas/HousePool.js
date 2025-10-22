import { Schema } from 'mongoose';

const housePoolSchema = new Schema({
    pair: {
        type: Schema.Types.ObjectId,
        ref: 'Pair',
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 100000,
        min: 0
    },
    lockedInOrders: {
        type: Number,
        default: 0,
        min: 0
    },
},
    {
        timestamps: true,
    });

// Virtual for available liquidity
housePoolSchema.virtual('available').get(function () {
    return this.balance - this.lockedInOrders;
});

housePoolSchema.set('toJSON', {
    virtuals: true
})

housePoolSchema.set('toObject', {
    virtuals: true
})


export default housePoolSchema;
