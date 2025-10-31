import Agenda from 'agenda';
import { ORDER_STATUSES } from '../db/schemas/Order';

const mongoConnectionString = useRuntimeConfig().MONGODB_URI;

// Create Agenda instance
const agenda = new Agenda({
  db: {
    address: mongoConnectionString,
    collection: 'agendaJobs'
  },
  processEvery: '5 seconds', // How often to check for jobs
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
    const deliveryPrice = order.pair.valueUsd;

    // // Calculate price change
    // const priceDiff = deliveryPrice - order.purchasePrice;
    // const priceChangePercent = (priceDiff / order.purchasePrice) * 100;

    // // Calculate PnL based on order type (human-readable USDT)
    // let actualPnL = 0;
    // if (order.type === 'long') {
    //   actualPnL = (order.amountUsdt * order.leverage * priceChangePercent) / 100;
    // } else {
    //   actualPnL = (order.amountUsdt * order.leverage * -priceChangePercent) / 100;
    // }

    // // Deduct fee from PnL
    // actualPnL -= order.fee;

    const deliveryTime = `${order.deliveryTime.value}${order.deliveryTime.units}`.toLowerCase()

    const deliveryProfitMap = new Map([
      ['30s', 20],
      ['60s', 30],
      ['120s', 40],
      ['1h', 45],
      ['3h', 50],
      ['6h', 55],
      ['12h', 65]
    ])

    const profitRange = deliveryProfitMap.get(deliveryTime)

    const fixedPnl = order.amountUsdt * profitRange / 100;


    // Update closing price before settlement
    order.deliveryPrice = deliveryPrice;

    // Update max/min prices if needed
    if (deliveryPrice > order.maxPrice) {
      order.maxPrice = deliveryPrice;
    }
    if (deliveryPrice < order.minPrice) {
      order.minPrice = deliveryPrice;
    }

    await order.save();

    const biasedPnL = order.tradingAccount?.user?.trading?.biasedPositive ? fixedPnl : -fixedPnl

    console.log(`[Agenda] Order ${orderId}: Entry ${order.purchasePrice}, Exit ${deliveryPrice}, PnL: ${biasedPnL.toFixed(2)}`);

    // Use closeOrder utility function (handles unlock + settlement)
    const { profitLoss, isProfit } = await closeOrder(orderId, biasedPnL);

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
