import { model } from "mongoose";
import { priceDataUpdateLogger } from "../services/logService";

const SYMBOL_MAP = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'USDT': 'tether',
    'BNB': 'binancecoin', 'SOL': 'solana', 'XRP': 'ripple',
    'ADA': 'cardano', 'DOGE': 'dogecoin', 'MATIC': 'matic-network',
    'DOT': 'polkadot', 'TRX': 'tron', 'LTC': 'litecoin',
    'SHIB': 'shiba-inu', 'AVAX': 'avalanche-2', 'DAI': 'dai',
    'LINK': 'chainlink', 'UNI': 'uniswap', 'ATOM': 'cosmos',
    'XLM': 'stellar'
};

const CURRENCY_MAP = {
    'USDT': 'usd', 'USD': 'usd', 'EUR': 'eur',
    'GBP': 'gbp', 'BTC': 'btc', 'ETH': 'eth'
};

const config = useRuntimeConfig();
const API_KEYS = [config.COIN_GECKO_API_KEY1, config.COIN_GECKO_API_KEY2].filter(Boolean);
let currentKeyIndex = 0;

const getCoinGeckoId = (symbol) => SYMBOL_MAP[symbol.toUpperCase()] || symbol.toLowerCase();
const getVsCurrency = (quoteAsset) => CURRENCY_MAP[quoteAsset.toUpperCase()] || 'usd';

const fetchCoinGeckoPriceData = async (coinId, vsCurrency, fromTimestamp, toTimestamp, retryCount = 0) => {
    try {
        const apiKey = API_KEYS[currentKeyIndex];
        const params = new URLSearchParams({
            vs_currency: vsCurrency,
            from: fromTimestamp.toString(),
            to: toTimestamp.toString()
        });
        if (apiKey) params.append('x_cg_demo_api_key', apiKey);

        const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range?${params}`;
        const response = await $fetch(url);

        if (!response?.prices) return [];
        return response.prices.map(([ts, price]) => [Math.floor(ts / 1000), price]);
    } catch (error) {
        if (retryCount < API_KEYS.length - 1) {
            currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
            return fetchCoinGeckoPriceData(coinId, vsCurrency, fromTimestamp, toTimestamp, retryCount + 1);
        }

        const logFn = priceDataUpdateLogger?.error;
        logFn(`CoinGecko API Error for ${coinId}: ${error.message}`);
        return [];
    }
};

const aggregateTo1Minute = (priceData) => {
    if (!priceData?.length) return [];

    const buckets = {};
    priceData.forEach(([timestamp, price]) => {
        const bucket = Math.floor(timestamp / 60) * 60;
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

const initializePairData = async (docId, pair) => {
    const coinId = getCoinGeckoId(pair.baseAsset);
    const vsCurrency = getVsCurrency(pair.quoteAsset);
    const now = Math.floor(Date.now() / 1000);
    const oneYearAgo = now - (365 * 24 * 60 * 60);
    const sixMonths = 180 * 24 * 60 * 60;

    const logFn = priceDataUpdateLogger?.log;
    logFn(`Initializing ${pair.baseAsset}/${pair.quoteAsset}`);

    let allPriceData = [];
    for (let start = oneYearAgo; start < now; start += sixMonths) {
        const end = Math.min(start + sixMonths, now);
        const chunkData = await fetchCoinGeckoPriceData(coinId, vsCurrency, start, end);
        if (chunkData.length > 0) allPriceData.push(...chunkData);
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (allPriceData.length === 0) {
        const warnFn = priceDataUpdateLogger?.warn;
        warnFn(`No data for ${pair.baseAsset}/${pair.quoteAsset}`);
        return 0;
    }

    const aggregatedData = aggregateTo1Minute(allPriceData);
    const PriceData = model("PriceData");

    await PriceData.updateOne(
        { _id: docId },
        {
            $set: {
                dataSeries: aggregatedData,
                lastDataTimestamp: aggregatedData[aggregatedData.length - 1][0],
                isInitialized: true,
                lastUpdated: now
            }
        }
    );

    const successFn = priceDataUpdateLogger?.success;
    successFn(`Initialized ${pair.baseAsset}/${pair.quoteAsset} (${aggregatedData.length} points)`);
    return aggregatedData.length;
};

const updatePairData = async (docId, pair, lastTimestamp) => {
    const coinId = getCoinGeckoId(pair.baseAsset);
    const vsCurrency = getVsCurrency(pair.quoteAsset);
    const now = Math.floor(Date.now() / 1000);
    const fromTimestamp = lastTimestamp || (now - 3600);

    if (now - fromTimestamp < 60) return 0;

    const newData = await fetchCoinGeckoPriceData(coinId, vsCurrency, fromTimestamp, now);
    if (newData.length === 0) return 0;

    const aggregatedData = aggregateTo1Minute(newData);
    if (aggregatedData.length === 0) return 0;

    const PriceData = model("PriceData");
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await PriceData.updateOne(
                { _id: docId },
                {
                    $push: {
                        dataSeries: { $each: aggregatedData }
                    },
                    $set: {
                        lastDataTimestamp: aggregatedData[aggregatedData.length - 1][0],
                        lastUpdated: now
                    }
                }
            );

            if (result.matchedCount === 0 && attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }

            return aggregatedData.length;
        } catch (error) {
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }
            throw error;
        }
    }

    return 0;
};

async function processPriceDataUpdates(options = {}) {
    const { priorityOnly = false, limit = 25, logContext = 'UPDATE' } = options;
    const PriceData = model("PriceData");

    try {
        const uninitializedCount = await PriceData.countDocuments({ isInitialized: false });
        const hasUninitialized = uninitializedCount > 0;

        let query, sort;
        if (hasUninitialized && !priorityOnly) {
            query = { isInitialized: false };
            sort = { createdAt: 1 };
        } else if (priorityOnly) {
            query = { isInitialized: true, lastDataTimestamp: { $ne: null } };
            sort = { priority: -1, lastUpdated: 1 };
        } else {
            query = { isInitialized: true, lastDataTimestamp: { $ne: null } };
            sort = { lastUpdated: 1 };
        }

        const records = await PriceData.find(query, {
            _id: 1,
            pair: 1,
            isInitialized: 1,
            lastDataTimestamp: 1
        })
            .sort(sort)
            .limit(limit)
            .populate('pair', 'baseAsset quoteAsset');

        if (records.length === 0) {
            const logFn = priceDataUpdateLogger?.log;
            logFn(`[${logContext}] No records to process`);
            return;
        }

        const logFn = priceDataUpdateLogger?.log;
        logFn(`[${logContext}] Processing ${records.length} pairs (${hasUninitialized ? 'initializing' : 'updating'})`);

        let processedCount = 0;
        for (const record of records) {
            if (!record.pair) continue;

            try {
                let pointsAdded = 0;

                if (!record.isInitialized) {
                    pointsAdded = await initializePairData(record._id, record.pair);
                } else {
                    pointsAdded = await updatePairData(record._id, record.pair, record.lastDataTimestamp);
                }

                if (pointsAdded > 0) {
                    processedCount++;
                    const successFn = priceDataUpdateLogger?.success;
                    successFn(`[${logContext}] ${record.pair.baseAsset}/${record.pair.quoteAsset} (+${pointsAdded} points)`);
                }
            } catch (error) {
                const errorFn = priceDataUpdateLogger?.error;
                errorFn(`[${logContext}] Error: ${record.pair.baseAsset}/${record.pair.quoteAsset} - ${error.message}`);
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const successFn = priceDataUpdateLogger?.success;
        successFn(`[${logContext}] Completed: ${processedCount}/${records.length} updated`);
    } catch (error) {
        const errorFn = priceDataUpdateLogger?.error;
        errorFn(`[${logContext}] Task error: ${error.message}`);
    }
}

export async function initializePriceDataTasks(agenda) {
    await initializeRecurringJob(
        agenda,
        'update-priority-pairs',
        async () => {
            await processPriceDataUpdates({
                priorityOnly: true,
                limit: 20,
                logContext: 'PRIORITY'
            });
        },
        '30 minutes'
    );

    if (priceDataUpdateLogger?.initialize) {
        priceDataUpdateLogger.initialize({ frequency: '30 minutes', task: 'PRIORITY' });
    }

    await initializeRecurringJob(
        agenda,
        'update-all-pairs',
        async () => {
            await processPriceDataUpdates({
                limit: 25,
                logContext: 'ALL'
            });
        },
        '2 hours'
    );

    if (priceDataUpdateLogger?.initialize) {
        priceDataUpdateLogger.initialize({ frequency: '2 hours', task: 'ALL' });
    }
}