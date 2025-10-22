
const Pair = getModel('Pair');
const BINANCE_24HR_TICKER = 'https://api.binance.com/api/v3/ticker/24hr';

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
    console.error('Error fetching Binance prices:', error.message);
    throw error;
  }
}

async function updateCryptoPrices() {
  try {
    console.log('=============== PRICE UPDATE START ===============');
    
    // Fetch both USDT and USD pairs
    const pairs = await Pair.find({ 
      quoteAsset: { $in: ['USDT', 'USD'] } 
    }).select('_id baseAsset quoteAsset category');

    if (pairs.length === 0) {
      console.log('No USDT or USD pairs found in database');
      return;
    }

    console.log(`Found ${pairs.length} pairs in database`);

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

    console.log(`Fetched ${binanceData.length} pairs from Binance`);
    console.log(`- ${binanceMapUSDT.size} USDT pairs`);
    console.log(`- ${binanceMapUSD.size} USD pairs`);

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
        console.log(`⚠️  No Binance data for ${pair.baseAsset}/${pair.quoteAsset}`);
      }
    }

    if (bulkOps.length > 0) {
      const result = await Pair.bulkWrite(bulkOps, { ordered: false });
      console.log(`✓ Updated ${result.modifiedCount} out of ${pairs.length} pairs`);
      if (notFoundCount > 0) {
        console.log(`⚠️  ${notFoundCount} pairs not found on Binance`);
      }
      console.log('=============== PRICE UPDATE END ===============\n');
      return result;
    } else {
      console.log('No matching pairs found on Binance');
      console.log('=============== PRICE UPDATE END ===============\n');
    }
  } catch (error) {
    console.error('Error updating prices:', error.message);
    console.log('=============== PRICE UPDATE END ===============\n');
  }
}

export function initializePriceUpdateTask(agenda) {
  agenda.define('update-crypto-prices', async (job) => {
    await updateCryptoPrices();
  });

  agenda.every('30 seconds', 'update-crypto-prices');

  console.log('=============== AGENDA TASK INITIALIZED ===============');
  console.log('Task: update-crypto-prices');
  console.log('Interval: 30 seconds');
  console.log('=======================================================\n');

  agenda.now('update-crypto-prices');
}

export { updateCryptoPrices };