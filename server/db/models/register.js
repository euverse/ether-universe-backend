import { model } from "mongoose";
import userSchema from "../schemas/User.js";
import WalletChallengeSchema from "../schemas/WalletChallenge.js";
import kycSubmissionSchema from "../schemas/KYCSubmission.js";
import balanceSchema from "../schemas/Balance.js";
import housePoolSchema from "../schemas/HousePool.js";
import tradingAccountSchema from "../schemas/TradingAccount.js";
import transactionSchema from "../schemas/Transaction.js";
import walletSchema from "../schemas/Wallet.js";
import adminSchema from '../schemas/Admin.js';
import assetAllocationSchema from "../schemas/AssetAllocation.js";
import depositSchema from '../schemas/Deposit.js';
import withdrawalSchema from '../schemas/Withdrawal.js';
import adminWalletSchema from '../schemas/AdminWallet.js';
import pairSchema from "../schemas/Pair.js";
import chatSchema from "../schemas/Chat.js";
import networkSchema from "../schemas/Network.js";
import orderSchema from "../schemas/Order.js";
import notificationSchema from "../schemas/Notification.js";
import adminBalanceSchema from "../schemas/AdminBalance.js";
import blackListedIp from "../schemas/BlackListedIp.js";
import priceDataSchema from "../schemas/PriceData.js";

const MODELS_REGISTER = {
    AssetAllocation: model('AssetAllocation', assetAllocationSchema, 'assets allocations'),
    Chat: model("Chat", chatSchema),
    HousePool: model('HousePool', housePoolSchema, 'house pools'),
    TradingAccount: model('TradingAccount', tradingAccountSchema, 'trading accounts'),
    Transaction: model('Transaction', transactionSchema),
    User: model('User', userSchema),
    Balance: model('Balance', balanceSchema, 'user balances'),
    Wallet: model('Wallet', walletSchema, 'user wallets'),
    WalletChallenge: model('WalletChallenge', WalletChallengeSchema, 'auth wallet challenges'),
    KYCSubmission: model('KYCSubmission', kycSubmissionSchema, 'kyc submissions'),
    Admin: model('Admin', adminSchema),
    Deposit: model('Deposit', depositSchema),
    Withdrawal: model('Withdrawal', withdrawalSchema),
    AdminWallet: model('AdminWallet', adminWalletSchema, 'admin wallets'),
    AdminBalance: model('AdminBalance', adminBalanceSchema, 'admin balances'),
    Pair: model('Pair', pairSchema),
    Network: model('Network', networkSchema),
    Order: model('Order', orderSchema),
    Notification: model('Notification', notificationSchema),
    BlackListedIp: model('BlackListedIp', blackListedIp, 'blacklisted ips'),
    PriceData: model('PriceData', priceDataSchema, 'price data')
}

export const getModel = (key) => {
    if (!MODELS_REGISTER.hasOwnProperty(key)) throw Error('Model does not exist');

    return MODELS_REGISTER[key]
}
