import { Schema } from "mongoose";

export const ORDER_TYPES = {
  LONG: 'long',
  SHORT: 'short'
};

export const ORDER_STATUSES = {
  PENDING: 'pending',
  OPEN: 'open',
  CANCELLED: 'cancelled',
  CLOSED: 'closed'
};

const orderSchema = new Schema({
  tradingAccount: {
    type: Schema.Types.ObjectId,
    ref: 'TradingAccount',
    required: true
  },
  pair: {
    type: Schema.Types.ObjectId,
    ref: 'Pair',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: Object.values(ORDER_TYPES)
  },
  amountUsdt: {
    type: Number,
    required: true,
    min: 1,
  },
  leverage: {
    type: Number,
    required: true,
    min: 1,
    max: 300
  },
  status: {
    type: String,
    required: true,
    enum: Object.values(ORDER_STATUSES),
    default: ORDER_STATUSES.OPEN
  },
  deliveryTime: {
    units: {
      type: String,
      required: true,
      enum: ['s', 'h']
    },
    value: {
      type: Number,
      required: true
    }
  },
  purchasePrice: {
    type: Number,
    required: true
  },
  deliveryPrice: {
    type: Number
  },
  maxPrice: {
    type: Number
  },
  minPrice: {
    type: Number
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  purchasedAt: {
    type: Date,
    required: true
  },
  deliveredAt: {
    type: Date
  },
  pnL: {
    type: Number,
    default: 0
  },
  fee: {
    type: Number,
    default: 0
  },
  // Store locked balance distributions (in smallest units for settlement)
  lockedBalanceDistributions: [{
    balanceId: {
      type: Schema.Types.ObjectId,
      ref: 'Balance'
    },
    network: String,
    amount: String // Stored in smallest units (wei/satoshi)
  }],
  // Store locked balance distributions (in smallest units for settlement)
  lockedAllocationDistributions: [{
    allocationId: {
      type: Schema.Types.ObjectId,
      ref: 'AssetAllocation'
    },
    amount: String, // Stored in smallest units (wei/satoshi)
    expiresAt: Date
  }],
}, {
  timestamps: true,
  toObject: { virtuals: true },
  toJSON: { virtuals: true }
});

// Indexes for performance
orderSchema.index({ tradingAccount: 1, status: 1 });
orderSchema.index({ tradingAccount: 1, deliveredAt: -1 });
orderSchema.index({ status: 1, purchasedAt: 1 });

/**
 * Virtual for position size
 */
orderSchema.virtual('positionSize').get(function () {
  return this.amountUsdt * this.leverage;
});

/**
 * Virtual for calculating floating PnL on open orders
 * Compares current price to entry price
 */
orderSchema.virtual('floatingPnL').get(async function () {
  if (this.status === ORDER_STATUSES.PENDING) {
    return null;
  }

  if (this.status !== ORDER_STATUSES.CLOSED) {
    return this.pnL; // Return actual PnL for closed orders
  }

  try {
    const Pair = getModel('Pair');
    const pair = await Pair.findById(this.pair).select('valueUsd');

    if (!pair) return 0;

    const currentPrice = pair.valueUsd;
    const priceDiff = currentPrice - this.purchasePrice;
    const priceChangePercent = (priceDiff / this.purchasePrice) * 100;

    let floatingPnL = 0;

    const positionSize = this.amountUsdt * this.leverage;
    if (this.type === ORDER_TYPES.LONG) {
      // Long: profit when price goes up
      floatingPnL = (positionSize * priceChangePercent) / 100;
    } else {
      // Short: profit when price goes down
      floatingPnL = (positionSize * -priceChangePercent) / 100;
    }

    // Subtract fee from floating PnL
    return floatingPnL - (this.fee || 0);
  } catch {
    return 0;
  }
});


/**
 * Virtual for total locked amount (human-readable)
 */
orderSchema.virtual('totalLocked').get(function () {
  return this.amountUsdt + (this.fee || 0);
});


export default orderSchema;