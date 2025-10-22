import { createAllocation, addAllocationToAccount } from '../../utils/allocation.js';

export default defineEventHandler(async (event) => {
    const admin = event.context.admin;
    
    if (!admin) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }
    
    const { userId, amount, pairId } = await readBody(event);
    
    if (!userId || !amount || !pairId) {
        throw createError({
            statusCode: 400,
            statusMessage: 'userId, amount, and pairId are required'
        });
    }
    
    if (amount <= 0) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Amount must be greater than 0'
        });
    }
    
    try {
        const User = getModel('User');
        const TradingPair = getModel('TradingPair');
        const HousePool = getModel('HousePool');
        const TradingAccount = getModel('TradingAccount');
        
        // 1. Validate user exists and has trading account
        const user = await User.findById(userId).populate('trading.currentAccount');
        if (!user) {
            throw createError({
                statusCode: 404,
                statusMessage: 'User not found'
            });
        }
        
        if (!user.trading?.currentAccount) {
            throw createError({
                statusCode: 400,
                statusMessage: 'User does not have an active trading account'
            });
        }
        
        // 2. Validate trading pair exists
        const tradingPair = await TradingPair.findById(pairId);
        if (!tradingPair) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Trading pair not found'
            });
        }
        
        // 3. Check house pool liquidity
        const housePool = await HousePool.findOne({ tradingPair: pairId });
        if (!housePool || parseFloat(housePool.balance) < amount) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Insufficient balance in house pool'
            });
        }
        
        // 4. Create allocation record
        const allocation = await createAllocation(
            userId,
            user.trading.currentAccount._id,
            pairId,
            amount
        );
        
        // 5. Add funds to trading account (this is what matters for trading)
        await addAllocationToAccount(user.trading.currentAccount._id, amount);
        
        // 6. Deduct from house pool
        await HousePool.findOneAndUpdate(
            { tradingPair: pairId },
            {
                $inc: {
                    balance: -amount,
                    available: -amount
                }
            }
        );
        
        const updatedAccount = await TradingAccount.findById(user.trading.currentAccount._id);
        
        return {
            success: true,
            message: `Successfully allocated ${amount} ${tradingPair.symbol}`,
            allocation: {
                allocationId: allocation._id,
                userId: userId,
                amount: amount,
                pairId: pairId,
                pairSymbol: tradingPair.symbol,
                tradingAccountBalance: updatedAccount.balance,
                tradingAccountEquity: updatedAccount.equity,
                allocatedAt: allocation.allocatedAt,
                expiresAt: allocation.expiresAt,
                timeRemaining: allocation.getFormattedTimeRemaining()
            }
        };
        
    } catch (error) {
        if (error.statusCode) throw error;
        
        console.error('Asset allocation error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: error.message || 'Failed to allocate asset'
        });
    }
});