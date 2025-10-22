import { model } from "mongoose";

export const setupHousePools = async function () {
  console.log("====Setting up house pools====");

  const Pair = model("Pair");
  const HousePool = model("HousePool");

  try {
    const existingPools = await HousePool.find().select("pair").lean();

    const missingPairs = await Pair.find({
      _id: { $nin: existingPools.map((pool) => pool.pair) }
    })
      .select("_id category isTradable")

    const poolsToInsert = missingPairs
      .filter((pair) => pair.isTradable)
      .map((pair) => ({
        pair: pair._id,
        balance: 100000,
        lockedInOrders: 0,
      }));

    if (poolsToInsert.length > 0) {
      await HousePool.insertMany(poolsToInsert, { ordered: false });
      console.log(`Created ${poolsToInsert.length} new house pools.`);
    } else {
      console.log("All house pools already exist.");
    }
  } catch (err) {
    if (err.code === 11000) {
      console.warn("Duplicate house pool detected, skipping existing entries.");
    } else {
      console.error("Error setting up pools:", err);
    }
  }
};
