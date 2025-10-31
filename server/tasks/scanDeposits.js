import {
    scanAllBitcoinWalletsForDeposits,
    sweepPendingBitcoinDeposits
} from "../services/btcDepositService";

import {
    scanAllEVMWalletsForDeposits,
    sweepPendingDeposits
} from "../services/evmDepositsService";
import { btcDepositScanLogger, btcSweepLogger, evmDepositScanLogger, evmSweepLogger } from "../services/logService";


/**
 * Initialize all deposit scanning and sweeping tasks
 */
export async function initializeDepositScanTasks(agenda) {
    await initializeAllEVMAgendaTasks(agenda);
    await initializeAllBitcoinAgendaTasks(agenda);
}

// EVM TASKS

/**
 * Initialize all EVM agenda tasks
 */
export async function initializeAllEVMAgendaTasks(agenda) {
    await initializeEVMDepositScannerTask(agenda);
    await initializeEVMSweepTask(agenda);
}



/**
 * Scan EVM wallets for deposits using balance-based approach
 * Runs every 3 minutes (much less frequent than before!)
 */
export async function initializeEVMDepositScannerTask(agenda) {
    const handler = async (job) => {
        try {
            evmDepositScanLogger.start();
            const results = await scanAllEVMWalletsForDeposits();

            if (results.found > 0) {
                evmDepositScanLogger.success(`Found ${results.found} new deposits across ${results.scanned} wallets`);
            } else {
                evmDepositScanLogger.log(`No new deposits found (${results.scanned} wallets scanned)`);
            }

            job.attrs.lastRun = new Date();
        } catch (error) {
            evmDepositScanLogger.error(` Error: ${error.message}`);
            throw error;
        }
    };


    await initializeRecurringJob(agenda, 'scan-evm-deposits', handler, '3 minutes')

    evmDepositScanLogger.initialize({ frequency: '3 minutes' });
}


/**
 * Sweep confirmed EVM deposits to admin wallet
 * Runs every 5 minutes
 */
export async function initializeEVMSweepTask(agenda) {
    const handler = async (job) => {
        try {
            evmSweepLogger.start();
            const results = await sweepPendingDeposits();

            if (results.swept > 0) {
                evmSweepLogger.success(`Successfully swept ${results.swept} deposits to admin wallet`);

                // Log details
                results.details.forEach(detail => {
                    if (detail.status === 'success') {
                        evmSweepLogger.success(`  - ${detail.amount} ${detail.pair} on ${detail.network}`);
                    }
                });
            }

            if (results.failed > 0) {
                evmSweepLogger.warn(`Failed to sweep ${results.failed} deposits`);

                // Log failures
                results.details.forEach(detail => {
                    if (detail.status === 'failed') {
                        evmSweepLogger.warn(`  - ${detail.amount} ${detail.pair} on ${detail.network}: ${detail.error}`);
                    }
                });
            }

            if (results.swept === 0 && results.failed === 0) {
                evmSweepLogger.log('No deposits to sweep');
            }

            job.attrs.lastRun = new Date();
        } catch (error) {
            evmSweepLogger.error(`Error: ${error.message}`);
            throw error;
        }
    }

    await initializeRecurringJob(agenda, 'sweep-evm-deposits', handler, '5 minutes')

    evmSweepLogger.initialize({ frequency: '5 minutes' });
}

// BITCOIN TASKS

/**
 * Initialize all Bitcoin agenda tasks
 */
export async function initializeAllBitcoinAgendaTasks(agenda) {
    await initializeBitcoinDepositScannerTask(agenda);
    await initializeBitcoinSweepTask(agenda);
}

/**
 * Scan Bitcoin wallets for deposits using balance-based approach
 * Runs every 5 minutes (Bitcoin blocks are slower)
 */
export async function initializeBitcoinDepositScannerTask(agenda) {
    const handler = async (job) => {
        try {
            btcDepositScanLogger.start();
            const results = await scanAllBitcoinWalletsForDeposits();

            if (results.found > 0) {
                btcDepositScanLogger.success(`Found ${results.found} new deposits across ${results.scanned} wallets`);
            } else {
                btcDepositScanLogger.log(`No new deposits found (${results.scanned} wallets scanned)`);
            }

            job.attrs.lastRun = new Date();
        } catch (error) {
            btcDepositScanLogger.error(`Error: ${error.message}`);
            throw error;
        }
    }

    await initializeRecurringJob(agenda, 'scan-bitcoin-deposits', handler, '5 minutes')

    btcDepositScanLogger.initialize({ frequency: '5 minutes' });
}


/**
 * Sweep confirmed Bitcoin deposits to admin wallet
 * Runs every 10 minutes
 */
export async function initializeBitcoinSweepTask(agenda) {
    const handler = async (job) => {
        try {
            btcSweepLogger.start();
            const results = await sweepPendingBitcoinDeposits();

            if (results.swept > 0) {
                btcSweepLogger.success(`Successfully swept ${results.swept} deposits to admin wallet`);

                // Log details
                results.details.forEach(detail => {
                    if (detail.status === 'success') {
                        btcSweepLogger.log(`  - ${detail.amount} ${detail.pair} on ${detail.network}`);
                    }
                });
            }

            if (results.failed > 0) {
                btcSweepLogger.warn(`Failed to sweep ${results.failed} deposits`);

                // Log failures
                results.details.forEach(detail => {
                    if (detail.status === 'failed') {
                        btcSweepLogger.warn(`  - ${detail.amount} ${detail.pair} on ${detail.network}: ${detail.error}`);
                    }
                });
            }

            if (results.swept === 0 && results.failed === 0) {
                btcSweepLogger.log('No deposits to sweep');
            }

            job.attrs.lastRun = new Date();
        } catch (error) {
            btcSweepLogger.error(` Error: ${error}`);
            throw error;
        }
    };

    await initializeRecurringJob(agenda, 'sweep-bitcoin-deposits', handler, '10 minutes', { runAfter: 120000 })
    btcSweepLogger.initialize({ frequency: '10 minutes' });
}