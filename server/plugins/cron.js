import { processExpiredAllocations } from '../utils/allocation.js';

export default defineNitroPlugin(() => {
    console.log('[CRON] Initializing allocation withdrawal scheduler...');
    
    setInterval(async () => {
        try {
            const results = await processExpiredAllocations();
            
            if (results.success.length > 0 || results.failed.length > 0) {
                console.log('[CRON] Allocation withdrawal completed:', {
                    successful: results.success.length,
                    failed: results.failed.length,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('[CRON] Error processing expired allocations:', error);
        }
    }, 60000);
    
    console.log('[CRON] Scheduler started - checking for expired allocations every minute');
});