import { getAllocationHistory } from '../../../utils/allocation.js';

export default defineEventHandler(async (event) => {
    const user = event.context.user;
    
    if (!user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }
    
    try {
        const query = getQuery(event);
        const limit = parseInt(query.limit) || 10;
        
        const allocations = await getAllocationHistory(user._id, limit);
        
        return {
            allocations: allocations.map(allocation => ({
                allocationId: allocation._id,
                amount: allocation.amount,
                pairSymbol: allocation.pairId?.symbol,
                pairName: allocation.pairId?.name,
                allocatedAt: allocation.allocatedAt,
                withdrawnAt: allocation.withdrawnAt,
                profitDuringPeriod: allocation.profitDuringPeriod,
                status: allocation.status
            }))
        };
    } catch (error) {
        console.error('Get allocation history error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to get allocation history'
        });
    }
});