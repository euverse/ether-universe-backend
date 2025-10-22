import { model } from "mongoose";
import networkSchema from "../schemas/Network.js";

model("Network", networkSchema);

// const rpcUrlsEnv = useRuntimeConfig().rpcUrls;
const rpcUrlsEnv = {
  btc: "https://btc.publicnode.com",
  ethereum: "https://eth.llamarpc.com",
  polygon: "https://polygon.llamarpc.com",
};


const initialNetworks = [
  {
    name: "Bitcoin",
    chainType: "bitcoin",
    rpcUrl: rpcUrlsEnv.btc,
    logoUrl: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png"
  },
  {
    name: "Ethereum",
    chainType: "evm",
    chainId: 1,
    rpcUrl: rpcUrlsEnv.ethereum,
    logoUrl: "https://assets.coingecko.com/coins/images/279/small/ethereum.png"
  },
  {
    name: "Polygon",
    chainType: "evm",
    chainId: 137,
    rpcUrl: rpcUrlsEnv.polygon,
    logoUrl: "https://assets.coingecko.com/coins/images/4713/small/polygon.png"
  }
];

export const setupNetworks = async function () {
  console.log("=====Setting up networks=======");

  const Network = model("Network");

  try {
    const existingNetworks = await Network.find({});
    const existingNetworkIds = existingNetworks.map(
      (network) => network.id
    );

    const networksToInsert = initialNetworks.filter(
      (network) => !existingNetworkIds.includes(network.name.toLowerCase())
    );

    if (networksToInsert.length > 0) {
      await Network.insertMany(
        networksToInsert.map((network) => ({
          id: network.name.toLowerCase(),
          ...network,
        }))
      );
    } else {
      console.log("All trading networks already exist.");
    }
  } catch (err) {
    console.error("Error setting up trading networks:", err);
  }
};
