import { TRANSACTION_TYPES, TRANSACTION_STATUSES } from '~/db/schemas/Transaction.js';

export default defineEventHandler(async (event) => {
    const admin = event.context.auth?.admin;
    
    if (!admin) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }
    
    const { pairId, recipientAddress, amount } = await readBody(event);
    
    if (!pairId || !recipientAddress || !amount) {
        throw createError({
            statusCode: 400,
            statusMessage: 'pairId, recipientAddress, and amount are required'
        });
    }
    
    if (amount <= 0) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Amount must be greater than 0'
        });
    }
    
    try {
        const Pair = getModel('Pair');
        const AdminWallet = getModel('AdminWallet');
        const Transaction = getModel('Transaction');
        const Wallet = getModel('Wallet');
        const Balance = getModel('Balance');
        
        // 1. Find the pair
        const pair = await Pair.findById(pairId);
        
        if (!pair) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Pair not found'
            });
        }

        const baseCurrency = pair.baseAsset;

        const adminWallet = await AdminWallet.findOne({ 
            network: baseCurrency, 
            isActive: true 
        });
        
        if (!adminWallet) {
            throw createError({
                statusCode: 404,
                statusMessage: `No active admin wallet found for ${baseCurrency}`
            });
        }
        
        const currencyToNetworkMap = {
            'USDT': 'ethereum',
            'USDC': 'ethereum', 
            'BTC': 'bitcoin',
            'ETH': 'ethereum',
            'BNB': 'binance-smart-chain',
            'MATIC': 'polygon'
        };
        
        const userNetwork = currencyToNetworkMap[baseCurrency];
        if (!userNetwork) {
            throw createError({
                statusCode: 400,
                statusMessage: `Unsupported currency: ${baseCurrency}`
            });
        }
        
        const currentBalance = parseFloat(adminWallet.lastCheckedBalance || '0');
        if (currentBalance < amount) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Insufficient balance in admin wallet'
            });
        }
        
        const recipientWallet = await Wallet.findOne({ 
            address: recipientAddress,
            network: userNetwork 
        }).populate('tradingAccount');
        
        if (!recipientWallet) {
            throw createError({
                statusCode: 404,
                statusMessage: `Recipient wallet not found for address ${recipientAddress} on ${userNetwork} network`
            });
        }
        
        const TradingAccount = getModel('TradingAccount');
        const tradingAccount = await TradingAccount.findById(recipientWallet.tradingAccount);
        
        if (!tradingAccount || !tradingAccount.user) {
            throw createError({
                statusCode: 404,
                statusMessage: 'User not found for recipient wallet'
            });
        }
        
        const newAdminBalance = (currentBalance - amount).toFixed(pair.decimals || 8);
        adminWallet.lastCheckedBalance = newAdminBalance;
        adminWallet.lastCheckedAt = new Date();
        await adminWallet.save();
        
        let balance = await Balance.findOne({ 
            wallet: recipientWallet._id,
            pair: pairId
        });
        
        if (!balance) {
            balance = await Balance.create({
                wallet: recipientWallet._id,
                pair: pairId,
                realBalance: '0',
                virtualBalance: '0',
                total: '0',
                decimals: pair.decimals || 18,
                locked: '0',
                totalDeposited: '0',
                totalWithdrawn: '0'
            });
        }
        
        const recipientCurrentBalance = parseFloat(balance.realBalance || '0');
        const newRecipientBalance = (recipientCurrentBalance + amount).toFixed(pair.decimals || 8);
        balance.realBalance = newRecipientBalance;
        balance.total = newRecipientBalance;
        await balance.save();
        
        await Transaction.create({
            user: tradingAccount.user,
            wallet: recipientWallet._id,
            network: pair._id,
            type: TRANSACTION_TYPES.TRANSFER,
            amount: amount.toFixed(pair.decimals || 8),
            balanceAfter: newRecipientBalance,
            status: TRANSACTION_STATUSES.COMPLETED,
            txHash: `admin_transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });
        
        return {
            message: 'successful'
        };
        
    } catch (error) {
        if (error.statusCode) throw error;
        
        console.error('Transfer transaction error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: error.message || 'Failed to process transfer'
        });
    }
});