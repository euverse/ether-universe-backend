import agenda, { startAgenda } from '../lib/agenda.js';
import { initializeDepositScanTasks } from '../tasks/scanDeposits.js';
import { initializePriceUpdateTask } from '../tasks/updateCryptoPrices.js';
import { initializePriceDataTasks } from '../tasks/updatePriceData.js';

export default defineNitroPlugin(async () => {
    await startAgenda();
    initializePriceUpdateTask(agenda)
    initializeDepositScanTasks(agenda)
    initializePriceDataTasks(agenda)
})