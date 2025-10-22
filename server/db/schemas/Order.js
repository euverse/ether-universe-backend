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
    min: 0.01,
    max: 50000
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
  openingPrice: {
    type: Number,
    required: true
  },
  closingPrice: {
    type: Number
  },
  maxPrice: {
    type: Number
  },
  minPrice: {
    type: Number
  },
  openedAt: {
    type: Date,
    required: true
  },
  closedAt: {
    type: Date
  },
  pnl: {
    type: Number,
    default: 0
  },
  fee: {
    type: Number,
    default: 0
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
  houseLock: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for performance
orderSchema.index({ tradingAccount: 1, status: 1 });
orderSchema.index({ tradingAccount: 1, closedAt: -1 });
orderSchema.index({ status: 1, openedAt: 1 });

/**
 * Virtual for calculating floating PnL on open orders
 * Compares current price to entry price
 */
orderSchema.virtual('floatingPnl').get(async function () {
  if (this.status !== ORDER_STATUSES.OPEN) {
    return this.pnl; // Return actual PnL for closed orders
  }

  try {
    const Pair = getModel('Pair');
    const pair = await Pair.findById(this.pair).select('valueUsd');

    if (!pair) return 0;

    const currentPrice = pair.valueUsd;
    const priceDiff = currentPrice - this.openingPrice;
    const priceChangePercent = (priceDiff / this.openingPrice) * 100;

    let floatingPnl = 0;

    if (this.type === ORDER_TYPES.LONG) {
      // Long: profit when price goes up
      floatingPnl = (this.amountUsdt * this.leverage * priceChangePercent) / 100;
    } else {
      // Short: profit when price goes down
      floatingPnl = (this.amountUsdt * this.leverage * -priceChangePercent) / 100;
    }

    // Subtract fee from floating PnL
    return floatingPnl - (this.fee || 0);
  } catch {
    return 0;
  }
});

/**
 * Virtual for position size
 */
orderSchema.virtual('positionSize').get(function () {
  return this.amountUsdt * this.leverage;
});

/**
 * Virtual for total locked amount (human-readable)
 */
orderSchema.virtual('totalLocked').get(function () {
  return this.amountUsdt + (this.fee || 0);
});

orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

export default orderSchema;