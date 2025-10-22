import { getActiveAllocation } from '../../../utils/allocation.js';

export default defineEventHandler(async (event) => {
    const user = event.context.user;
    
    if (!user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }
    
    try {
        const allocation = await getActiveAllocation(user._id);
        
        if (!allocation) {
            return {
                hasActiveAllocation: false,
                allocation: null
            };
        }
        
        return {
            hasActiveAllocation: true,
            allocation: {
                allocationId: allocation._id,
                amount: allocation.amount,
                pairSymbol: allocation.pairId?.symbol,
                pairName: allocation.pairId?.name,
                allocatedAt: allocation.allocatedAt,
                expiresAt: allocation.expiresAt,
                timeRemaining: allocation.getFormattedTimeRemaining()
            }
        };
    } catch (error) {
        console.error('Get active allocation error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to get active allocation'
        });
    }
});