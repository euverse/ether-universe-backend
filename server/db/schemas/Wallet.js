import { Schema } from "mongoose";
import { CHAIN_TYPES } from "./Network";

const walletSchema = new Schema({
  tradingAccount: {
    type: Schema.Types.ObjectId,
    ref: 'TradingAccount',
    required: true
  },
  chainType: {
    type: String,
    enum: Object.values(CHAIN_TYPES),
    required: true
  },
  address: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  derivationPath: {
    type: String,
    // select: false
  }
}, {
  timestamps: true
});

// One wallet per chain type per trading account
walletSchema.index({ tradingAccount: 1, chainType: 1 }, { unique: true });
walletSchema.index({ address: 1, chainType: 1 }, { unique: true });

export default walletSchema;