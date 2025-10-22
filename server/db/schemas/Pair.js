import { Schema } from "mongoose";
import { CHAIN_TYPES } from "./Network";

export const PAIR_CATEGORIES = {
  CRYPTO: 'crypto',
  STABLE_COINS: 'stable_coins'
}

const pairSchema = new Schema(
  {
    symbol: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    baseAsset: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    quoteAsset: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    valueUsd: {
      type: Number,
      default: 0,
    },
    percentageChange: {
      type: Number,
      default: 0,
    },
    high24h: {
      type: Number,
      default: 0,
    },
    low24h: {
      type: Number,
      default: 0,
    },
    volume24h: {
      type: Number,
      default: 0,
    },
    category: {
      type: String,
      required: true,
      enum: Object.values(PAIR_CATEGORIES)
    },
    logoUrl: {
      type: String,
      required: true,
      trim: true,
    },
    networks: {
      type: [String],
    },
    chainType: {
      type: String,
      enum: Object.values(CHAIN_TYPES),
    },
    decimals: {
      type: Number,
    },
    // For ERC-20 tokens, contract addresses per network
    contractAddresses: {
      type: Map,
      of: String,
      default: {}
      // Example: { 'ethereum': '0x...', 'polygon': '0x...' }
    },
    isActive: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);


pairSchema.virtual('isTradable').get(function () {
  return this.category !== PAIR_CATEGORIES.STABLE_COINS
})

export default pairSchema;