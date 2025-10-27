import Agenda from 'agenda';
import { ORDER_STATUSES } from '../db/schemas/Order';

const mongoConnectionString = useRuntimeConfig().MONGODB_URI;

// Create Agenda instance
const agenda = new Agenda({
  db: {
    address: mongoConnectionString,
    collection: 'agendaJobs'
  },
  processEvery: '10 seconds', // How often to check for jobs
  maxConcurrency: 20
});


/**
 * Define the close order job
 * Runs when delivery time expires
 */

agenda.define('close order', async (job) => {
  const { orderId } = job.attrs.data;

  try {
    console.log(`[Agenda] Closing order: ${orderId}`);

    const Order = getModel('Order');

    // Check if order exists and is open
    const order = await Order.findById(orderId).populate([
      {
        path: 'pair',
        select: 'valueUsd baseAsset'
      },
      {
        path: 'tradingAccount',
        select: 'user',
        populate: {
          path: 'user',
          select: 'trading.biasedPositive'
        }
      },
    ]);

    if (!order) {
      console.error(`[Agenda] Order ${orderId} not found`);
      return;
    }

    if (order.status !== ORDER_STATUSES.OPEN) {
      console.log(`[Agenda] Order ${orderId} already ${order.status}`);
      return;
    }

    // Get current market price
    const closingPrice = order.pair.valueUsd;

    // Calculate price change
    const priceDiff = closingPrice - order.openingPrice;
    const priceChangePercent = (priceDiff / order.openingPrice) * 100;

    // Calculate PnL based on order type (human-readable USDT)
    let pnl = 0;
    if (order.type === 'long') {
      pnl = (order.amountUsdt * order.leverage * priceChangePercent) / 100;
    } else {
      pnl = (order.amountUsdt * order.leverage * -priceChangePercent) / 100;
    }

    // Deduct fee from PnL
    pnl -= order.fee;

    console.log(`[Agenda] Order ${orderId}: Entry ${order.openingPrice}, Exit ${closingPrice}, PnL: ${pnl.toFixed(2)}`);

    // Update closing price before settlement
    order.closingPrice = closingPrice;

    // Update max/min prices if needed
    if (closingPrice > order.maxPrice) {
      order.maxPrice = closingPrice;
    }
    if (closingPrice < order.minPrice) {
      order.minPrice = closingPrice;
    }

    await order.save();

    const biasedPnl = order.tradingAccount?.user?.trading?.biasedPositive ? Math.abs(pnl) : pnl

    // Use closeOrder utility function (handles unlock + settlement)
    const { profitLoss, isProfit } = await closeOrder(orderId, biasedPnl);

    console.log(`[Agenda] ✅ Order ${orderId} closed. Final PnL: ${profitLoss} (${isProfit ? 'Profit' : 'Loss'})`);

  } catch (error) {
    console.error(`[Agenda] Error closing order ${orderId}:`, error);
    throw error; // Retry the job
  }
});

// Graceful shutdown
async function graceful() {
  await agenda.stop();
  process.exit(0);
}

process.on('SIGTERM', graceful);
process.on('SIGINT', graceful);

export default agenda;

export async function startAgenda() {
  // Start agenda
  await agenda.start();
  console.log('Agenda started');
}
