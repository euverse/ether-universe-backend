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
export function initializeDepositScanTasks(agenda) {
    initializeAllEVMAgendaTasks(agenda);
    initializeAllBitcoinAgendaTasks(agenda);
}

// EVM TASKS

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
    });

    agenda.every('3 minutes', 'scan-evm-deposits');
    evmDepositScanLogger.initialize({frequency:'3 minutes'});

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
    });

    agenda.every('5 minutes', 'sweep-evm-deposits');
    evmSweepLogger.initialize({frequency:'5 minutes'});
}

// BITCOIN TASKS

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
    });

    agenda.every('5 minutes', 'scan-bitcoin-deposits');

    btcDepositScanLogger.initialize({ frequency: '5 minutes' });

    agenda.now('scan-bitcoin-deposits');
}


/**
 * Sweep confirmed Bitcoin deposits to admin wallet
 * Runs every 10 minutes
 */
export function initializeBitcoinSweepTask(agenda) {
    agenda.define('sweep-bitcoin-deposits', async (job) => {
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
    });

    agenda.every('10 minutes', 'sweep-bitcoin-deposits');
    btcSweepLogger.initialize({ frequency: '10 minutes' });

    // Run 2 minutes after startup
    setTimeout(() => {
        agenda.now('sweep-bitcoin-deposits');
    }, 120000);
}