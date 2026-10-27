import { Schema } from "mongoose";

export const ACCOUNT_TYPES = {
  DEMO: 'demo',
  REAL: 'real'
};

const tradingAccountSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: Object.values(ACCOUNT_TYPES),
    required: true
  },
  balance: {
    type: Number,
    default: 0,
  },
  equity: {
    type: Number,
    default: 0,
  },
  margin: {
    type: Number,
    default: 0,
  },
  freeMargin: {
    type: Number,
    default: 0,
  },
  leverage: {
    type: Number,
    default: 200,
  },
  marginLevel: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Per-account mutex for /convert — prevents a second conversion from
  // starting while one is already in flight for this account.
  convertLockExpiresAt: {
    type: Date,
    default: null
  },
}, {
  timestamps: true
});

tradingAccountSchema.index({ user: 1, type: 1 });
tradingAccountSchema.index({ user: 1, isActive: 1 });

export default tradingAccountSchema;