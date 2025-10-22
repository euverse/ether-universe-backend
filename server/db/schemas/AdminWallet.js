// Admin Wallet Schema
import { Schema } from 'mongoose';
import { CHAIN_TYPES } from './Network.js';

const adminWalletSchema = new Schema({
  chainType: {
    type: String,
    enum: Object.values(CHAIN_TYPES),
    required: true,
    unique: true
  },
  address: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true
  },
  derivationPath: {
    type: String,
    select: false
  },
  label: {
    type: String,
    default: function () {
      return `${this.chainType} Treasury`;
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes
adminWalletSchema.index({ isActive: 1 });

export default adminWalletSchema;