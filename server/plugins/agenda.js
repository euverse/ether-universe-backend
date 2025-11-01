import agenda, { startAgenda } from '../lib/agenda.js';
import { defineDeliverOrder } from '../tasks/deliverOrder.js';
import { initializeDepositScanTasks } from '../tasks/scanDeposits.js';
import { initializePriceUpdateTask } from '../tasks/updateCryptoPrices.js';
import { initializePriceDataTasks } from '../tasks/updatePriceData.js';

export default defineNitroPlugin(async () => {
    await startAgenda();
    await initializePriceUpdateTask(agenda)
    await initializeDepositScanTasks(agenda)
    await initializePriceDataTasks(agenda)
    defineDeliverOrder(agenda)
})