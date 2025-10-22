import { model } from "mongoose";
import userSchema from "../schemas/User.js";
import WalletChallengeSchema from "../schemas/WalletChallenge.js";
import kycSubmissionSchema from "../schemas/KYCSubmission.js";
import tradingPairSchema from '../schemas/TradingPair.js';
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

const MODELS_REGISTER = {
    AssetAllocation: model('AssetAllocation', assetAllocationSchema),
    Chat: model("Chat", chatSchema),
    HousePool: model('HousePool', housePoolSchema),
    TradingAccount: model('TradingAccount', tradingAccountSchema),
    Transaction: model('Transaction', transactionSchema),
    User: model('User', userSchema),
    Balance: model('Balance', balanceSchema),
    Wallet: model('Wallet', walletSchema),
    WalletChallenge: model('WalletChallenge', WalletChallengeSchema),
    KYCSubmission: model('KYCSubmission', kycSubmissionSchema),
    TradingPair: model('TradingPair', tradingPairSchema),
    Admin: model('Admin', adminSchema),
    Deposit: model('Deposit', depositSchema),
    Withdrawal: model('Withdrawal', withdrawalSchema),
    AdminWallet: model('AdminWallet', adminWalletSchema),
    AdminBalance: model('AdminBalance', adminBalanceSchema),
    Pair: model('Pair', pairSchema),
    Network: model('Network', networkSchema),
    Order: model('Order', orderSchema),
    Notification: model('Notification', notificationSchema),
    BlackListedIp: model('BlackListedIp', blackListedIp)
}

export const getModel = (key) => {
    if (!MODELS_REGISTER.hasOwnProperty(key)) throw Error('Model does not exist');

    return MODELS_REGISTER[key]
}
