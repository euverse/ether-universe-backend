import {
    scanAllBitcoinWalletsForDeposits,
    sweepPendingBitcoinDeposits
} from "../services/btcDepositService";

import {
    scanAllEVMWalletsForDeposits,
    sweepPendingDeposits
} from "../services/evmDepositsService";

/**
 * Initialize all deposit scanning and sweeping tasks
 */
export function initializeDepositScanTasks(agenda) {
    initializeAllEVMAgendaTasks(agenda);
    initializeAllBitcoinAgendaTasks(agenda);
}

// ============================================
// EVM TASKS
// ============================================

/**
 * Initialize all EVM agenda tasks
 */
export function initializeAllEVMAgendaTasks(agenda) {
    initializeEVMDepositScannerTask(agenda);
    initializeEVMSweepTask(agenda);
}

/**
 * Scan EVM wallets for deposits using balance-based approach
 * Runs every 3 minutes (much less frequent than before!)
 */
export function initializeEVMDepositScannerTask(agenda) {
    agenda.define('scan-evm-deposits', async (job) => {
        try {
            console.log('[scan-evm-deposits] Starting balance-based deposit scan...');
            const results = await scanAllEVMWalletsForDeposits();

            if (results.found > 0) {
                console.log(`[scan-evm-deposits] ✅ Found ${results.found} new deposits across ${results.scanned} wallets`);
            } else {
                console.log(`[scan-evm-deposits] No new deposits found (${results.scanned} wallets scanned)`);
            }

            job.attrs.lastRun = new Date();
        } catch (error) {
            console.error('[scan-evm-deposits] ❌ Error:', error);
            throw error;
        }
    });

    agenda.every('3 minutes', 'scan-evm-deposits');
    console.log('=============== AGENDA TASK INITIALIZED ===============');
    console.log('Task: scan-evm-deposits');
    console.log('Interval: 3 minutes (balance-based scanning)');
    console.log('Description: Efficient balance checking without block scanning');
    console.log('=======================================================\n');

    // Run immediately on startup
    agenda.now('scan-evm-deposits');
}

/**
 * Sweep confirmed EVM deposits to admin wallet
 * Runs every 5 minutes
 */
export function initializeEVMSweepTask(agenda) {
    agenda.define('sweep-evm-deposits', async (job) => {
        try {
            console.log('[sweep-evm-deposits] Starting sweep process...');
            const results = await sweepPendingDeposits();

            if (results.swept > 0) {
                console.log(`[sweep-evm-deposits] ✅ Successfully swept ${results.swept} deposits to admin wallet`);

                // Log details
                results.details.forEach(detail => {
                    if (detail.status === 'success') {
                        console.log(`  - ${detail.amount} ${detail.pair} on ${detail.network}`);
                    }
                });
            }

            if (results.failed > 0) {
                console.log(`[sweep-evm-deposits] ⚠️ Failed to sweep ${results.failed} deposits`);

                // Log failures
                results.details.forEach(detail => {
                    if (detail.status === 'failed') {
                        console.log(`  - ${detail.amount} ${detail.pair} on ${detail.network}: ${detail.error}`);
                    }
                });
            }

            if (results.swept === 0 && results.failed === 0) {
                console.log('[sweep-evm-deposits] No deposits to sweep');
            }

            job.attrs.lastRun = new Date();
        } catch (error) {
            console.error('[sweep-evm-deposits] ❌ Error:', error);
            throw error;
        }
    });

    agenda.every('5 minutes', 'sweep-evm-deposits');
    console.log('=============== AGENDA TASK INITIALIZED ===============');
    console.log('Task: sweep-evm-deposits');
    console.log('Interval: 5 minutes');
    console.log('Description: Automatically sweep confirmed deposits to admin wallet');
    console.log('=======================================================\n');
}

// ============================================
// BITCOIN TASKS
// ============================================

/**
 * Initialize all Bitcoin agenda tasks
 */
export function initializeAllBitcoinAgendaTasks(agenda) {
    initializeBitcoinDepositScannerTask(agenda);
    initializeBitcoinSweepTask(agenda);
}

/**
 * Scan Bitcoin wallets for deposits using balance-based approach
 * Runs every 5 minutes (Bitcoin blocks are slower)
 */
export function initializeBitcoinDepositScannerTask(agenda) {
    agenda.define('scan-bitcoin-deposits', async (job) => {
        try {
            console.log('[scan-bitcoin-deposits] Starting balance-based deposit scan...');
            const results = await scanAllBitcoinWalletsForDeposits();

            if (results.found > 0) {
                console.log(`[scan-bitcoin-deposits] ✅ Found ${results.found} new deposits across ${results.scanned} wallets`);
            } else {
                console.log(`[scan-bitcoin-deposits] No new deposits found (${results.scanned} wallets scanned)`);
            }

            job.attrs.lastRun = new Date();
        } catch (error) {
            console.error('[scan-bitcoin-deposits] ❌ Error:', error);
            throw error;
        }
    });

    agenda.every('5 minutes', 'scan-bitcoin-deposits');
    console.log('=============== AGENDA TASK INITIALIZED ===============');
    console.log('Task: scan-bitcoin-deposits');
    console.log('Interval: 5 minutes (balance-based scanning)');
    console.log('Description: Efficient balance checking for Bitcoin');
    console.log('=======================================================\n');

    agenda.now('scan-bitcoin-deposits');
}

/**
 * Sweep confirmed Bitcoin deposits to admin wallet
 * Runs every 10 minutes
 */
export function initializeBitcoinSweepTask(agenda) {
    agenda.define('sweep-bitcoin-deposits', async (job) => {
        try {
            console.log('[sweep-bitcoin-deposits] Starting sweep process...');
            const results = await sweepPendingBitcoinDeposits();

            if (results.swept > 0) {
                console.log(`[sweep-bitcoin-deposits] ✅ Successfully swept ${results.swept} deposits to admin wallet`);

                // Log details
                results.details.forEach(detail => {
                    if (detail.status === 'success') {
                        console.log(`  - ${detail.amount} ${detail.pair} on ${detail.network}`);
                    }
                });
            }

            if (results.failed > 0) {
                console.log(`[sweep-bitcoin-deposits] ⚠️ Failed to sweep ${results.failed} deposits`);

                // Log failures
                results.details.forEach(detail => {
                    if (detail.status === 'failed') {
                        console.log(`  - ${detail.amount} ${detail.pair} on ${detail.network}: ${detail.error}`);
                    }
                });
            }

            if (results.swept === 0 && results.failed === 0) {
                console.log('[sweep-bitcoin-deposits] No deposits to sweep');
            }

            job.attrs.lastRun = new Date();
        } catch (error) {
            console.error('[sweep-bitcoin-deposits] ❌ Error:', error);
            throw error;
        }
    });

    agenda.every('10 minutes', 'sweep-bitcoin-deposits');
    console.log('=============== AGENDA TASK INITIALIZED ===============');
    console.log('Task: sweep-bitcoin-deposits');
    console.log('Interval: 10 minutes');
    console.log('Description: Automatically sweep confirmed Bitcoin deposits to admin wallet');
    console.log('NOTE: Requires bitcoinjs-lib implementation');
    console.log('=======================================================\n');

    // Run 2 minutes after startup
    setTimeout(() => {
        agenda.now('sweep-bitcoin-deposits');
    }, 120000);
}