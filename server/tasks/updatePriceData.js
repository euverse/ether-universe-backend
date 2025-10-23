import { model } from "mongoose";

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
        'DOT': 'polkadot',
        'TRX': 'tron',
        'LTC': 'litecoin',
        'SHIB': 'shiba-inu',
        'AVAX': 'avalanche-2',
        'DAI': 'dai',
        'LINK': 'chainlink',
        'UNI': 'uniswap',
        'ATOM': 'cosmos',
        'XLM': 'stellar'
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

// Fetch price data from CoinGecko with API key
const fetchCoinGeckoPriceData = async (coinId, vsCurrency, fromTimestamp, toTimestamp) => {
    try {
        const config = useRuntimeConfig();
        const apiKey = config.COIN_GECKO_API_KEY;

        // Build URL with API key as query parameter
        const baseUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range`;
        const params = new URLSearchParams({
            vs_currency: vsCurrency,
            from: fromTimestamp.toString(),
            to: toTimestamp.toString()
        });

        if (apiKey) {
            params.append('x_cg_demo_api_key', apiKey);
        }

        const url = `${baseUrl}?${params.toString()}`;

        const response = await $fetch(url);

        if (!response?.prices) return [];

        // Convert to [timestamp_seconds, price]
        return response.prices.map(([timestamp, price]) => [
            Math.floor(timestamp / 1000),
            price
        ]);
    } catch (error) {
        console.error(`CoinGecko API Error for ${coinId}:`, error.message);
        return [];
    }
};

// Aggregate to 1-minute intervals
const aggregateTo1Minute = (priceData) => {
    if (!priceData?.length) return [];

    const buckets = {};
    const oneMinute = 60;

    priceData.forEach(([timestamp, price]) => {
        const bucket = Math.floor(timestamp / oneMinute) * oneMinute;
        if (!buckets[bucket]) buckets[bucket] = [];
        buckets[bucket].push(price);
    });

    return Object.entries(buckets)
        .map(([ts, prices]) => [
            Number(ts),
            prices.reduce((sum, p) => sum + p, 0) / prices.length
        ])
        .sort((a, b) => a[0] - b[0]);
};

// Initialize price data for a single pair (fetch up to 1 year of historical data)
const initializePairPriceData = async (priceDataDoc, pair) => {
    try {
        const coinId = getCoinGeckoId(pair.baseAsset);
        const vsCurrency = getVsCurrency(pair.quoteAsset);

        const now = Math.floor(Date.now() / 1000);
        // Free tier: max 365 days, fetch in 6-month chunks (180 days)
        const oneYearAgo = now - (365 * 24 * 60 * 60);
        const sixMonthsInSeconds = 180 * 24 * 60 * 60; // 6 months = 180 days

        console.log(`Initializing ${pair.baseAsset}/${pair.quoteAsset} with 1 year of data...`);

        let allPriceData = [];

        // Fetch in 6-month chunks (Demo tier limit per request)
        for (let start = oneYearAgo; start < now; start += sixMonthsInSeconds) {
            const end = Math.min(start + sixMonthsInSeconds, now);

            console.log(`  Fetching chunk: ${new Date(start * 1000).toISOString()} to ${new Date(end * 1000).toISOString()}`);

            const chunkData = await fetchCoinGeckoPriceData(coinId, vsCurrency, start, end);

            if (chunkData.length > 0) {
                allPriceData.push(...chunkData);
            }

            // Rate limit: 2 seconds between requests (30 calls/min = 1 call per 2 seconds)
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        if (allPriceData.length === 0) {
            console.warn(`No data fetched for ${pair.baseAsset}/${pair.quoteAsset}`);
            return 0;
        }

        // Aggregate to 1-minute intervals
        const aggregatedData = aggregateTo1Minute(allPriceData);

        priceDataDoc.dataSeries = aggregatedData;
        priceDataDoc.lastDataTimestamp = aggregatedData[aggregatedData.length - 1][0];
        priceDataDoc.isInitialized = true;
        priceDataDoc.lastUpdated = now;

        await priceDataDoc.save();

        console.log(`✓ Initialized ${aggregatedData.length} data points for ${pair.baseAsset}/${pair.quoteAsset}`);
        return aggregatedData.length;

    } catch (error) {
        console.error(`Error initializing ${pair.baseAsset}/${pair.quoteAsset}:`, error.message);
        return 0;
    }
};

// Update price data for a single pair (fetch only new data since last timestamp)
const updatePairPriceData = async (priceDataDoc, pair) => {
    try {
        const coinId = getCoinGeckoId(pair.baseAsset);
        const vsCurrency = getVsCurrency(pair.quoteAsset);

        // Determine from where to fetch
        let fromTimestamp;
        if (priceDataDoc.lastDataTimestamp) {
            // Fetch from last data point
            fromTimestamp = priceDataDoc.lastDataTimestamp;
        } else {
            // Fallback: fetch last hour
            fromTimestamp = Math.floor(Date.now() / 1000) - 3600;
        }

        const now = Math.floor(Date.now() / 1000);

        // Only fetch if there's meaningful time difference (at least 1 minute)
        if (now - fromTimestamp < 60) {
            return 0;
        }

        const newData = await fetchCoinGeckoPriceData(coinId, vsCurrency, fromTimestamp, now);

        if (newData.length === 0) {
            return 0;
        }

        // Aggregate to 1-minute intervals
        const aggregatedData = aggregateTo1Minute(newData);

        if (aggregatedData.length === 0) {
            return 0;
        }

        // Use findOneAndUpdate with retry to avoid version conflicts
        const PriceData = model("PriceData");
        const maxRetries = 3;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Get fresh document
                const freshDoc = await PriceData.findById(priceDataDoc._id);
                if (!freshDoc) {
                    console.error(`PriceData document not found: ${priceDataDoc._id}`);
                    return 0;
                }

                // Append new data points
                freshDoc.appendDataPoints(aggregatedData);
                await freshDoc.save();

                return aggregatedData.length;
            } catch (saveError) {
                if (saveError.message?.includes('No matching document') && attempt < maxRetries - 1) {
                    // Version conflict, wait and retry
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }
                throw saveError;
            }
        }

        return 0;
    } catch (error) {
        console.error(`Error updating ${pair.baseAsset}/${pair.quoteAsset}:`, error.message);
        return 0;
    }
};

// Initialize uninitialized price data records
async function initializeUninitializedPriceData() {
    console.log('=============== INITIALIZING PRICE DATA ===============');

    const PriceData = model("PriceData");

    try {
        // Find uninitialized price data records
        const uninitializedRecords = await PriceData.find({
            isInitialized: false
        })
            .limit(3) // Process 3 at a time (each needs 2 requests = 6 total, well under 30/min limit)
            .populate('pair', 'baseAsset quoteAsset');

        if (uninitializedRecords.length === 0) {
            console.log('All price data records are initialized');
            return;
        }

        console.log(`Found ${uninitializedRecords.length} uninitialized records`);

        for (const record of uninitializedRecords) {
            if (!record.pair) continue;

            try {
                const pointsAdded = await initializePairPriceData(record, record.pair);

                if (pointsAdded > 0) {
                    console.log(`✓ Initialized ${record.pair.baseAsset}/${record.pair.quoteAsset} with ${pointsAdded} points`);
                } else {
                    console.warn(`⚠️  Failed to initialize ${record.pair.baseAsset}/${record.pair.quoteAsset}`);
                }
            } catch (error) {
                console.error(`❌ Error initializing ${record.pair.baseAsset}/${record.pair.quoteAsset}:`, error.message);
                // Continue with next pair even if this one fails
            }

            // Additional delay between pairs (already have delays in initializePairPriceData)
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('=============== INITIALIZATION COMPLETE ===============\n');
    } catch (error) {
        console.error('Error in initialization task:', error);
        console.log('=============== INITIALIZATION COMPLETE ===============\n');
    }
}

// Update high-priority (frequently accessed) pairs
async function updateHighPriorityPairs() {
    console.log('=============== UPDATING HIGH-PRIORITY PAIRS ===============');

    const PriceData = model("PriceData");
    const Pair = model("Pair");

    try {
        // Get top 20 most accessed pairs that are FULLY INITIALIZED
        const highPriorityRecords = await PriceData.find({
            isInitialized: true,
            lastDataTimestamp: { $ne: null } // Must have data
        })
            .sort({ priority: -1 })
            .limit(20)
            .populate('pair', 'baseAsset quoteAsset');

        if (highPriorityRecords.length === 0) {
            console.log('No initialized records found');
            return;
        }

        console.log(`Updating ${highPriorityRecords.length} high-priority pairs`);

        let updatedCount = 0;

        for (const record of highPriorityRecords) {
            if (!record.pair) continue;

            const newPointsCount = await updatePairPriceData(record, record.pair);

            if (newPointsCount > 0) {
                updatedCount++;
                console.log(`✓ Updated ${record.pair.baseAsset}/${record.pair.quoteAsset} (+${newPointsCount} points)`);
            }

            // Rate limit: 2 seconds between requests (30 calls/min)
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log(`Updated ${updatedCount} high-priority pairs`);
        console.log('=============== HIGH-PRIORITY UPDATE COMPLETE ===============\n');
    } catch (error) {
        console.error('Error updating high-priority pairs:', error);
        console.log('=============== HIGH-PRIORITY UPDATE COMPLETE ===============\n');
    }
}

// Update all initialized pairs (less frequent)
async function updateAllPairs() {
    console.log('=============== UPDATING ALL PAIRS ===============');

    const PriceData = model("PriceData");
    const Pair = model("Pair");

    try {
        const allRecords = await PriceData.find({
            isInitialized: true,
            lastDataTimestamp: { $ne: null } // Must have data
        })
            .sort({ lastUpdated: 1 }) // Update oldest first
            .limit(25) // Process 25 at a time (50 seconds at 2s/call = safe for 60s interval)
            .populate('pair', 'baseAsset quoteAsset');

        if (allRecords.length === 0) {
            console.log('No initialized records found');
            return;
        }

        console.log(`Updating ${allRecords.length} pairs`);

        let updatedCount = 0;

        for (const record of allRecords) {
            if (!record.pair) continue;

            const newPointsCount = await updatePairPriceData(record, record.pair);

            if (newPointsCount > 0) {
                updatedCount++;
            }

            // Rate limit: 2 seconds between requests (30 calls/min)
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log(`Updated ${updatedCount} pairs`);
        console.log('=============== ALL PAIRS UPDATE COMPLETE ===============\n');
    } catch (error) {
        console.error('Error updating all pairs:', error);
        console.log('=============== ALL PAIRS UPDATE COMPLETE ===============\n');
    }
}

// Initialize agenda tasks
export function initializePriceDataTasks(agenda) {
    // Task 1: Initialize uninitialized records
    agenda.define('initialize-price-data', async (job) => {
        await initializeUninitializedPriceData();
    });

    // Task 2: Update high-priority pairs frequently
    agenda.define('update-high-priority-pairs', async (job) => {
        await updateHighPriorityPairs();
    });

    // Task 3: Update all pairs less frequently
    agenda.define('update-all-pairs', async (job) => {
        await updateAllPairs();
    });

    // Schedule tasks
    agenda.every('10 minutes', 'initialize-price-data');
    agenda.every('2 minutes', 'update-high-priority-pairs');
    agenda.every('15 minutes', 'update-all-pairs');

    console.log('=============== PRICE DATA TASKS INITIALIZED ===============');
    console.log('Task: initialize-price-data - Every 10 minutes');
    console.log('Task: update-high-priority-pairs - Every 2 minutes');
    console.log('Task: update-all-pairs - Every 15 minutes');
    console.log('=======================================================\n');

    // Run initialization immediately
    agenda.now('initialize-price-data');
}