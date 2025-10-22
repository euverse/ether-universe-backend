import { Schema } from 'mongoose';
import { NETWORKS } from './Network.js';

/**
 * Admin Balance Schema
 * Tracks treasury balances for each pair-network combination
 * All amounts stored in smallest units (wei/satoshi)
 */
const adminBalanceSchema = new Schema({
  wallet: {
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
  // Available balance (can be withdrawn)
  available: {
    type: String,
    default: '0'
  },
  // Locked balance (pending withdrawals)
  locked: {
    type: String,
    default: '0'
  },
  // Lifetime stats - money swept from users
  totalSweptIn: {
    type: String,
    default: '0'
  },
  // Lifetime stats - money withdrawn to users' external wallets
  totalWithdrawnToUsers: {
    type: String,
    default: '0'
  },
  // Lifetime stats - money withdrawn to admin external wallets
  totalWithdrawnToAdmin: {
    type: String,
    default: '0'
  },
  lastSweepAt: Date,
  lastWithdrawalAt: Date,
  lastOnchainSyncAt: Date
}, {
  timestamps: true
});

// Unique constraint: one balance per wallet-pair-network combination
adminBalanceSchema.index({ wallet: 1, pair: 1, network: 1 }, { unique: true });
adminBalanceSchema.index({ wallet: 1 });
adminBalanceSchema.index({ pair: 1, network: 1 });

// Virtual: total balance
adminBalanceSchema.virtual('total').get(function () {
  const available = parseFloat(this.available || '0');
  const locked = parseFloat(this.locked || '0');
  return (available + locked).toString();
});

adminBalanceSchema.set('toObject', { virtuals: true });
adminBalanceSchema.set('toJSON', { virtuals: true });

export default adminBalanceSchema;