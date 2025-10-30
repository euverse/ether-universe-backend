import agenda from '~/lib/agenda';

export default defineEventHandler(async (event) => {
  const sessionUser = event.context.auth.user;

  const { accountId, pairId, type, deliveryTime, amountUsdt } = await readAndValidateBody(event, {
    include: ['accountId', 'type', 'pairId', 'deliveryTime', 'amountUsdt'],
    customValidators: {
      amountUsdt: (val) => parseFloat(val) >= 100
    }
  });

  const amount = parseFloat(amountUsdt);

  // Validate pair is tradable
  const Pair = getModel('Pair');
  const pair = await Pair.findById(pairId).select('symbol baseAsset isTradable valueUsd decimals');

  if (!pair) {
    throw createError({ statusCode: 404, message: 'Pair not found' });
  }

  if (!pair.isTradable) {
    throw createError({ statusCode: 400, message: 'This pair is not tradable' });
  }

  // Get trading account and verify ownership
  const TradingAccount = getModel('TradingAccount');
  const tradingAccount = await TradingAccount.findOne({
    _id: accountId,
    user: sessionUser._id
  }).select('leverage');

  if (!tradingAccount) {
    throw createError({ statusCode: 403, message: 'Trading account not found or unauthorized' });
  }

  // Check USDT balance (returns human-readable values)
  const usdtBalance = await getTradingAccountUSDTBalance(tradingAccount._id);
  const totalAvailableUsdt = parseFloat(usdtBalance.totals.available);

  // Calculate fee (0.5%)
  const fee = amount * 0.005;
  const totalCost = amount + fee;

  // Check if user has enough balance (including fee)
  if (totalAvailableUsdt < totalCost) {
    throw createError({
      statusCode: 400,
      message: `Insufficient USDT. Required (with fee): ${totalCost.toFixed(2)}, Available: ${totalAvailableUsdt.toFixed(2)}`
    });
  }

  try {
    // Use placeOrder utility (handles locking and order creation)
    const { order } = await placeOrder(
      tradingAccount._id,
      pairId,
      type,
      amount.toString(),
      tradingAccount.leverage,
      parseDeliveryTime(deliveryTime),
      pair.valueUsd,
      fee.toString()
    );

    // Schedule order closure
    const closeAtMs = calculateCloseTime(deliveryTime);
    const closeAt = new Date(Date.now() + closeAtMs);

    await agenda.schedule(closeAt, 'close order', {
      orderId: order._id.toString()
    });

    const positionSize = amount * tradingAccount.leverage;

    return {
      id: order._id,
      pairSymbol: pair.symbol,
      type,
      amountUsdt: amount,
      fee,
      entryPrice: order.purchasePrice,
      leverage: tradingAccount.leverage,
      positionSize,
      status: order.status,
      deliveryTime: order.deliveryTime,
      closesAt: closeAt,
      createdAt: order.purchasedAt
    };
  } catch (error) {
    console.error(error)
    throw createError({
      statusCode: 500,
      message: `Failed to create order: ${error.message}`
    });
  }
});

function parseDeliveryTime(str) {
  const match = /^(\d+)([sh])$/.exec(str);
  if (!match) throw new Error('Invalid delivery time format. Use format: 1h or 30s');

  return {
    value: parseInt(match[1]),
    units: match[2]
  };
}

function calculateCloseTime(deliveryTimeStr) {
  const { value, units } = parseDeliveryTime(deliveryTimeStr);

  if (units === 's') {
    return value * 1000;
  } else if (units === 'h') {
    return value * 60 * 60 * 1000;
  }
}