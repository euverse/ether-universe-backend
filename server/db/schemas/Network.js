import { Schema } from "mongoose";

export const CHAIN_TYPES = {
  EVM: 'evm',
  BTC: 'bitcoin',
};

export const NETWORKS = {
  ETHEREUM: 'ethereum',
  POLYGON: 'polygon',
  BITCOIN: 'bitcoin',
  // Easy to add more
  ARBITRUM: 'arbitrum',
  BSC: 'bsc',
  OPTIMISM: 'optimism'
};

const networkSchema = new Schema({
  id: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  chainType: {
    type: String,
    enum: Object.values(CHAIN_TYPES),
    required: true
  },
  chainId: {
    type: Number,
    required: function () {
      return this.chainType === CHAIN_TYPES.EVM;
    }
  },
  rpcUrl: {
    type: String,
    required: true
  },
  explorerUrl: {
    type: String
  },
  nativeCurrency: {
    symbol: String,
    decimals: Number
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

networkSchema.index({ chainType: 1, isActive: 1 });

export default networkSchema;