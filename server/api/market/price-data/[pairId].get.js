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

// Aggregate cached 1m data to requested interval
const aggregateToInterval = (dataSeries, interval, startTime, endTime) => {
  if (!dataSeries?.length) return [];

  // Filter data within time range
  const filteredData = dataSeries.filter(
    ([timestamp]) => timestamp >= startTime && timestamp <= endTime
  );

  if (filteredData.length === 0) return [];

  // If requesting 1m data, return as-is
  if (interval === '1m') {
    return filteredData;
  }

  const intervalSeconds = intervalToSeconds(interval);
  const buckets = {};

  filteredData.forEach(([timestamp, price]) => {
    const bucket = Math.floor(timestamp / intervalSeconds) * intervalSeconds;
    if (!buckets[bucket]) {
      buckets[bucket] = [];
    }
    buckets[bucket].push(price);
  });

  return Object.entries(buckets)
    .map(([ts, prices]) => [
      Number(ts),
      prices.reduce((sum, p) => sum + p, 0) / prices.length
    ])
    .sort((a, b) => a[0] - b[0]);
};

// Normalize timestamp to seconds
const normalizeTimestamp = (ts) => {
  return ts > 9999999999 ? Math.floor(ts / 1000) : ts;
};

export default defineEventHandler(async (event) => {
  try {
    const pairId = getRouterParam(event, "pairId");
    if (!pairId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Pair ID is required'
      });
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

    // Validate timestamps
    if (startTime > nowSeconds) {
      throw createError({
        statusCode: 400,
        statusMessage: `startTime cannot be in the future`
      });
    }

    if (endTime > nowSeconds) {
      endTime = nowSeconds;
    }

    if (startTime >= endTime) {
      throw createError({
        statusCode: 400,
        statusMessage: 'startTime must be before endTime'
      });
    }

    // Validate time range (max 2 years)
    const maxRange = 2 * 365 * 24 * 60 * 60;
    if (endTime - startTime > maxRange) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Time range cannot exceed 2 years'
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

    // Get pair info
    const Pair = getModel('Pair');
    const pair = await Pair.findById(pairId);

    if (!pair) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Trading pair not found'
      });
    }

    // Get cached price data
    const PriceData = getModel('PriceData');
    const priceData = await PriceData.findOne({ pair: pairId });

    if (!priceData) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Price data not available for this pair'
      });
    }

    // Record query for priority tracking (async, don't wait)
    priceData.recordQuery().catch(err =>
      console.error('Error recording query:', err)
    );

    // Check if data is initialized
    if (!priceData.isInitialized || priceData.dataSeries.length === 0) {
      return {
        pairId: pair._id.toString(),
        symbol: `${pair.baseAsset}/${pair.quoteAsset}`,
        interval,
        priceData: [],
        message: 'Price data is being initialized. Please try again in a few minutes.'
      };
    }

    // Aggregate cached data to requested interval
    const aggregatedData = aggregateToInterval(
      priceData.dataSeries,
      interval,
      startTime,
      endTime
    );

    if (aggregatedData.length === 0) {
      return {
        pairId: pair._id.toString(),
        symbol: `${pair.baseAsset}/${pair.quoteAsset}`,
        interval,
        priceData: [],
        message: 'No price data available for the specified range'
      };
    }

    return {
      pairId: pair._id.toString(),
      symbol: `${pair.baseAsset}/${pair.quoteAsset}`,
      interval,
      dataPoints: aggregatedData.length,
      lastUpdated: priceData.lastUpdated,
      cacheAge: nowSeconds - priceData.lastUpdated,
      priceData: aggregatedData
    };

  } catch (error) {
    console.error('Price API Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Internal server error'
    });
  }
});