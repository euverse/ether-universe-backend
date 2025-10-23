import { model } from "mongoose";

export const setupPriceData = async function () {
    console.log("==== Setting up Price Data ====");

    const Pair = model("Pair");
    const PriceData = model("PriceData");

    try {
        // Find existing price data records
        const existingPriceData = await PriceData.find()
            .select("pair")
            .lean();

        // Find all tradable pairs
        const missingPairs = await Pair.find({
            _id: { $nin: existingPriceData.map((pd) => pd.pair) }
        })
            .select("_id baseAsset quoteAsset category isTradable")

        const priceDataToInsert = missingPairs
            .filter((pair) => pair.isTradable)
            .map((pair) => ({
                pair: pair._id,
                dataSeries: [],
                isInitialized: false,
                lastUpdated: Math.floor(Date.now() / 1000),
                lastDataTimestamp: null,
                queryCount: 0,
                priority: 0
            }));

        if (priceDataToInsert.length > 0) {
            await PriceData.insertMany(priceDataToInsert, { ordered: false });
            console.log(`Created ${priceDataToInsert.length} new price data records.`);
        } else {
            console.log("All price data records already exist.");
        }
    } catch (err) {
        if (err.code === 11000) {
            console.warn("Duplicate price data detected, skipping existing entries.");
        } else {
            console.error("Error setting up price data:", err);
        }
    }
};