
export default defineCachedEventHandler(async (event) => {
  try {
    const Pair = getModel('Pair');
    const pairs = await Pair.find().select('percentageChange').lean();

    // Calculate average market change
    const totalChange = pairs.reduce((sum, pair) => sum + pair.percentageChange, 0);
    const marketChange24h = pairs.length > 0 ? totalChange / pairs.length : 0;

    return {
      marketChange24h: parseFloat(marketChange24h.toFixed(2)),
    };
  } catch (error) {
    console.error('Get Market Overview Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to fetch market overview'
    });
  }
}, {
});