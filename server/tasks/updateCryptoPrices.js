import { priceUpdateLogger } from "../services/logService";

const Pair = getModel('Pair');
const BINANCE_24HR_TICKER = useRuntimeConfig().BINANCE_TICKER_URL;


async function fetchBinancePrices() {
  try {
    const data = await $fetch(BINANCE_24HR_TICKER);

    // Get both USDT pairs and USD(T) stablecoin pairs
    const usdtPairs = data
      .filter(ticker => ticker.symbol.endsWith('USDT'))
      .map(ticker => ({
        symbol: ticker.symbol,
        baseAsset: ticker.symbol.replace('USDT', ''),
        quoteAsset: 'USDT',
        price: parseFloat(ticker.lastPrice),
        percentageChange: parseFloat(ticker.priceChangePercent),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        volume24h: parseFloat(ticker.volume)
      }));

    // Get stablecoin prices (e.g., USDCUSDT, DAIUSDT, BUSDUSDT)
    const stablecoinPairs = data
      .filter(ticker =>
      (ticker.symbol === 'USDCUSDT' ||
        ticker.symbol === 'DAIUSDT' ||
        ticker.symbol === 'BUSDUSDT' ||
        ticker.symbol === 'TUSDUSDT' ||
        ticker.symbol === 'USDPUSDT')
      )
      .map(ticker => ({
        symbol: ticker.symbol,
        baseAsset: ticker.symbol.replace('USDT', ''),
        quoteAsset: 'USD',
        price: parseFloat(ticker.lastPrice),
        percentageChange: parseFloat(ticker.priceChangePercent),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        volume24h: parseFloat(ticker.volume)
      }));

    return [...usdtPairs, ...stablecoinPairs];
  } catch (error) {
    priceUpdateLogger.error('Error fetching Binance prices:', error.message);
    throw error;
  }
}

async function updateCryptoPrices() {
  try {
    priceUpdateLogger.start()

    // Fetch both USDT and USD pairs
    const pairs = await Pair.find({
      quoteAsset: { $in: ['USDT', 'USD'] }
    }).select('_id baseAsset quoteAsset category');

    if (pairs.length === 0) {
      priceUpdateLogger.warn('No USDT or USD pairs found in database');
      return;
    }

    priceUpdateLogger.log(`Found ${pairs.length} pairs in database`);

    const binanceData = await fetchBinancePrices();

    // Create maps for both quote assets
    const binanceMapUSDT = new Map(
      binanceData
        .filter(item => item.quoteAsset === 'USDT')
        .map(item => [item.baseAsset, item])
    );

    const binanceMapUSD = new Map(
      binanceData
        .filter(item => item.quoteAsset === 'USD')
        .map(item => [item.baseAsset, item])
    );

    priceUpdateLogger.log(`Fetched ${binanceData.length} pairs from Binance`);
    priceUpdateLogger.log(`${binanceMapUSDT.size} USDT pairs`);
    priceUpdateLogger.log(`${binanceMapUSD.size} USD pairs`);

    const bulkOps = [];
    let updatedCount = 0;
    let notFoundCount = 0;

    for (const pair of pairs) {
      let marketData = null;

      // Select the correct map based on quote asset
      if (pair.quoteAsset === 'USDT') {
        marketData = binanceMapUSDT.get(pair.baseAsset);
      } else if (pair.quoteAsset === 'USD') {
        marketData = binanceMapUSD.get(pair.baseAsset);
      }

      if (marketData) {
        bulkOps.push({
          updateOne: {
            filter: { _id: pair._id },
            update: {
              $set: {
                valueUsd: marketData.price,
                percentageChange: marketData.percentageChange,
                high24h: marketData.high24h,
                low24h: marketData.low24h,
                volume24h: marketData.volume24h
              }
            }
          }
        });
        updatedCount++;
      } else {
        notFoundCount++;
        priceUpdateLogger.warn(`No Binance data for ${pair.baseAsset}/${pair.quoteAsset}`);
      }
    }

    if (bulkOps.length > 0) {
      const result = await Pair.bulkWrite(bulkOps, { ordered: false });
      priceUpdateLogger.success(`Updated ${result.modifiedCount} out of ${pairs.length} pairs`);
      if (notFoundCount > 0) {
        priceUpdateLogger.warn(`${notFoundCount} pairs not found on Binance`);
      }
      return result;
    } else {
      priceUpdateLogger.warn('No matching pairs found on Binance');
    }
  } catch (error) {
    priceUpdateLogger.error('Error updating prices:', error.message);
  } finally {
    priceUpdateLogger.complete();
  }
}

export async function initializePriceUpdateTask(agenda) {

  await initializeRecurringJob(agenda, 'update-crypto-prices', updateCryptoPrices, '5 seconds')
  priceUpdateLogger.initialize({ frequency: '5 seconds' });

}

export { updateCryptoPrices };