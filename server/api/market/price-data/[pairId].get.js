
// Convert interval string to seconds
const intervalToSeconds = (interval) => {
  const intervals = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400
  };
  return intervals[interval] || 3600;
};

// Map symbol to CoinGecko ID
const getCoinGeckoId = (symbol) => {
  const symbolMap = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'USDT': 'tether',
    'BNB': 'binancecoin',
    'SOL': 'solana',
    'XRP': 'ripple',
    'ADA': 'cardano',
    'DOGE': 'dogecoin',
    'MATIC': 'matic-network',
    'DOT': 'polkadot'
  };
  return symbolMap[symbol.toUpperCase()] || symbol.toLowerCase();
};

// Map quote asset to valid CoinGecko vs_currency
const getVsCurrency = (quoteAsset) => {
  const currencyMap = {
    'USDT': 'usd',
    'USDC': 'usd',
    'BUSD': 'usd',
    'USD': 'usd',
    'EUR': 'eur',
    'GBP': 'gbp',
    'BTC': 'btc',
    'ETH': 'eth'
  };
  return currencyMap[quoteAsset.toUpperCase()] || 'usd';
};

// Normalize timestamp to seconds
const normalizeTimestamp = (ts) => {
  return ts > 9999999999 ? Math.floor(ts / 1000) : ts;
};

// Fetch price data from CoinGecko
const fetchCoinGeckoPriceData = async (coinId, vsCurrency, from, to) => {
  try {
    // Ensure timestamps are integers and in seconds
    const fromSeconds = Math.floor(from);
    const toSeconds = Math.floor(to);

    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range?vs_currency=${vsCurrency}&from=${fromSeconds}&to=${toSeconds}`;

    const response = await $fetch(url);

    if (!response?.prices) return [];

    // CoinGecko returns [timestamp_ms, price]
    // Convert to [timestamp_seconds, price] for consistency
    return response.prices.map(([timestamp, price]) => [
      Math.floor(timestamp / 1000), // Keep in seconds
      price
    ]);
  } catch (error) {
    console.error('CoinGecko API Error:', {
      message: error.message,
      data: error.data,
      statusCode: error.statusCode
    });
    return [];
  }
};

// Aggregate prices by interval
const aggregatePriceData = (priceData, interval) => {
  if (!priceData?.length) return [];

  const intervalSeconds = intervalToSeconds(interval);
  const buckets = {};

  priceData.forEach(([timestamp, price]) => {
    const bucket = Math.floor(timestamp / intervalSeconds) * intervalSeconds;
    if (!buckets[bucket]) buckets[bucket] = [];
    buckets[bucket].push(price);
  });

  return Object.entries(buckets)
    .map(([ts, prices]) => [
      Number(ts),
      prices.reduce((sum, p) => sum + p, 0) / prices.length
    ])
    .sort((a, b) => a[0] - b[0]); // Sort by timestamp
};

export default defineEventHandler(async (event) => {
  try {
    const pairId = getRouterParam(event, "pairId");
    if (!pairId) {
      throw createError({ statusCode: 400, statusMessage: 'Pair ID is required' });
    }

    const query = getQuery(event);
    const startRaw = parseInt(query.startTime || query.start_time);

    if (!startRaw || isNaN(startRaw)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Valid startTime (Unix timestamp) is required'
      });
    }

    const endRaw = query.endTime || query.end_time
      ? parseInt(query.endTime || query.end_time)
      : Math.floor(Date.now() / 1000);

    const startTime = normalizeTimestamp(startRaw);
    let endTime = normalizeTimestamp(endRaw);

    const nowSeconds = Math.floor(Date.now() / 1000);

    // Validate timestamps are not in the future
    if (startTime > nowSeconds) {
      throw createError({
        statusCode: 400,
        statusMessage: `startTime cannot be in the future. Received: ${startTime}, Current: ${nowSeconds}`
      });
    }

    if (endTime > nowSeconds) {
      console.warn(`endTime is in the future (${endTime}), adjusting to current time (${nowSeconds})`);
      // Auto-adjust endTime to now instead of failing
      endTime = nowSeconds;
    }

    // Validate time range
    if (startTime >= endTime) {
      throw createError({
        statusCode: 400,
        statusMessage: 'startTime must be before endTime'
      });
    }

    // CoinGecko has a 365-day limit for range queries
    const maxRange = 365 * 24 * 60 * 60; // 365 days in seconds
    if (endTime - startTime > maxRange) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Time range cannot exceed 365 days'
      });
    }

    const interval = query.interval?.toLowerCase() || '1h';
    const validIntervals = ['1m', '5m', '15m', '1h', '4h', '1d'];

    if (!validIntervals.includes(interval)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid interval. Must be one of: ${validIntervals.join(', ')}`
      });
    }

    const Pair = getModel('Pair');
    const pair = await Pair.findById(pairId);

    if (!pair) {
      throw createError({ statusCode: 404, statusMessage: 'Trading pair not found' });
    }

    const baseAsset = pair.baseAsset;
    const quoteAsset = pair.quoteAsset;
    const coinId = getCoinGeckoId(baseAsset);
    const vsCurrency = getVsCurrency(quoteAsset);

    let priceData = await fetchCoinGeckoPriceData(
      coinId,
      vsCurrency,
      startTime,
      endTime
    );

    if (!priceData.length) {
      return {
        pairId: pair._id.toString(),
        symbol: `${baseAsset}/${quoteAsset}`,
        interval,
        priceData: [],
        message: 'No price data available for the specified range'
      };
    }

    priceData = aggregatePriceData(priceData, interval);

    return {
      pairId: pair._id.toString(),
      symbol: `${baseAsset}/${quoteAsset}`,
      interval,
      dataPoints: priceData.length,
      priceData
    };
  } catch (error) {
    console.error('Price API Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Internal server error'
    });
  }
});