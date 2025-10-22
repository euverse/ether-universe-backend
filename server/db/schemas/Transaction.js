import { Schema } from "mongoose";

export const TRANSACTION_STATUSES = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const TRANSACTION_TYPES = {
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  TRANSFER: 'transfer',
};

const transactionSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  wallet: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
  },
  recipientWallet: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet',
  },
  network: {
    type: Schema.Types.ObjectId,
    ref: 'Network',
    required: true,
  },
  type: {
    type: String,
    enum: Object.values(TRANSACTION_TYPES),
    required: true,
  },
  amount: {
    type: String,
    required: true,
  },
  balanceAfter: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: Object.values(TRANSACTION_STATUSES),
    default: TRANSACTION_STATUSES.PENDING,
  },
  txHash: {
    type: String,
    default: null,
  },
}, { timestamps: true });

export default transactionSchema;
