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
    // Schedule order closure
    const purchasedAt = Date.now()
    const deliverAtMs = calculateCloseTime(deliveryTime);
    const deliverAt = new Date(purchasedAt + deliverAtMs);

    // Use placeOrder utility (handles locking and order creation)
    const { order } = await placeOrder({
      tradingAccountId: tradingAccount._id,
      pairId,
      orderType:type,
      amountUsdt: amount.toString(),
      leverage: tradingAccount.leverage,
      deliveryTime: parseDeliveryTime(deliveryTime),
      purchasePrice: pair.valueUsd,
      fee: fee.toString(),
      purchasedAt,
      deliverAt
    });


    await agenda.schedule(deliverAt, 'deliver order', {
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
      purchasedAt: order.purchasedAt
    };
  } catch (error) {
    console.error(error)
    throw createError({
      statusCode: 500,
      message: `Failed to create order: ${error.message}`
    });
  }
});

function parseDeliveryTime(str = "") {
  const [value, units] = str.trim().split("_")
  
  if (!value || !units ) throw new Error('Invalid delivery time format. Use format: 1h or 30s');

  return {
    value: parseInt(value.trim()),
    units: units.trim().toLowerCase()
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