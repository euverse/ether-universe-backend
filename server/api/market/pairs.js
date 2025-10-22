
export default defineEventHandler(async (event) => {
  try {
    const sessionUser = event.context.auth?.user;
    if (!sessionUser) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized'
      });
    }

    const { category = null } = getQuery(event);

    const Pair = getModel('Pair');
    const queryFilter = category ? { category } : {};

    const pairs = await Pair.find(queryFilter);

    const pairsData = pairs.map(formatPair);

    return { pairs: pairsData };

  } catch (error) {
    console.error('Get Trading Pairs Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to fetch trading pairs'
    });
  }
});

const formatPair = pair => ({
  _id: pair._id,
  symbol: pair.symbol,
  baseAsset: pair.baseAsset,
  quoteAsset: pair.quoteAsset,
  name: pair.name,
  valueUsd: pair.valueUsd,
  percentageChange: pair.percentageChange,
  high24h: pair.high24h,
  low24h: pair.low24h,
  volume24h: pair.volume24h,
  category: pair.category,
  isTradable: pair.isTradable,
  logoUrl: pair.logoUrl
})