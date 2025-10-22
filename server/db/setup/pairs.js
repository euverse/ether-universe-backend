import { model } from "mongoose";
import { PAIR_CATEGORIES } from "../schemas/Pair";
import { CHAIN_TYPES, NETWORKS } from "../schemas/Network";

const initialPairs = [
  {
    symbol: 'BTC/USDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    name: 'Bitcoin',
    isActive: true,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/btc@2x.png',
    chainType: CHAIN_TYPES.BTC,
    decimals: 8,
    networks: [NETWORKS.BITCOIN],
    contractAddresses: {}
  },
  {
    symbol: 'ETH/USDT',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    name: 'Ethereum',
    isActive: true,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/eth@2x.png',
    chainType: CHAIN_TYPES.EVM,
    decimals: 18,
    networks: [NETWORKS.ETHEREUM, NETWORKS.POLYGON],
    contractAddresses: {
      ethereum: null, // Native token
      polygon: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619' // Wrapped ETH
    }
  },
  {
    symbol: 'USDT/USD',
    baseAsset: 'USDT',
    quoteAsset: 'USD',
    name: 'Tether',
    valueUsd: 1.00,
    high24h: 1.00,
    low24h: 1.00,
    isActive: true,
    category: PAIR_CATEGORIES.STABLE_COINS,
    logoUrl: 'https://assets.coincap.io/assets/icons/usdt@2x.png',
    chainType: CHAIN_TYPES.EVM,
    decimals: 6,
    networks: [NETWORKS.ETHEREUM, NETWORKS.POLYGON],
    contractAddresses: {
      ethereum: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      polygon: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f'
    }
  },
  {
    symbol: 'BNB/USDT',
    baseAsset: 'BNB',
    quoteAsset: 'USDT',
    name: 'BNB',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/bnb@2x.png',
    chainType: CHAIN_TYPES.EVM,
    decimals: 18,
    networks: [NETWORKS.BSC],
    contractAddresses: {
      bsc: null // Native token
    }
  },
  {
    symbol: 'SOL/USDT',
    baseAsset: 'SOL',
    quoteAsset: 'USDT',
    name: 'Solana',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/sol@2x.png',
    decimals: 9,
  },
  {
    symbol: 'XRP/USDT',
    baseAsset: 'XRP',
    quoteAsset: 'USDT',
    name: 'Ripple',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/xrp@2x.png',
    decimals: 6,
  },
  {
    symbol: 'USDC/USD',
    baseAsset: 'USDC',
    quoteAsset: 'USD',
    name: 'USD Coin',
    isActive: false,
    category: PAIR_CATEGORIES.STABLE_COINS,
    logoUrl: 'https://assets.coincap.io/assets/icons/usdc@2x.png',
    chainType: CHAIN_TYPES.EVM,
    decimals: 6,
    networks: [NETWORKS.ETHEREUM, NETWORKS.POLYGON],
    contractAddresses: {
      ethereum: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      polygon: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'
    }
  },
  {
    symbol: 'ADA/USDT',
    baseAsset: 'ADA',
    quoteAsset: 'USDT',
    name: 'Cardano',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/ada@2x.png',
    decimals: 6,
  },
  {
    symbol: 'DOGE/USDT',
    baseAsset: 'DOGE',
    quoteAsset: 'USDT',
    name: 'Dogecoin',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/doge@2x.png',
    decimals: 8,
  },
  {
    symbol: 'TRX/USDT',
    baseAsset: 'TRX',
    quoteAsset: 'USDT',
    name: 'TRON',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/trx@2x.png',
    decimals: 6,
    contractAddresses: {}
  },
  {
    symbol: 'MATIC/USDT',
    baseAsset: 'MATIC',
    quoteAsset: 'USDT',
    name: 'Polygon',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/matic@2x.png',
    chainType: CHAIN_TYPES.EVM,
    decimals: 18,
    contractAddresses: {
      polygon: null // Native token
    }
  },
  {
    symbol: 'DOT/USDT',
    baseAsset: 'DOT',
    quoteAsset: 'USDT',
    name: 'Polkadot',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/dot@2x.png',
    decimals: 10,
  },
  {
    symbol: 'LTC/USDT',
    baseAsset: 'LTC',
    quoteAsset: 'USDT',
    name: 'Litecoin',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/ltc@2x.png',
    decimals: 8,
  },
  {
    symbol: 'SHIB/USDT',
    baseAsset: 'SHIB',
    quoteAsset: 'USDT',
    name: 'Shiba Inu',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/shib@2x.png',
    chainType: CHAIN_TYPES.EVM,
    decimals: 18,
    networks: [NETWORKS.ETHEREUM],
    contractAddresses: {
      ethereum: '0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce'
    }
  },
  {
    symbol: 'AVAX/USDT',
    baseAsset: 'AVAX',
    quoteAsset: 'USDT',
    name: 'Avalanche',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/avax@2x.png',
    decimals: 18,
  },
  {
    symbol: 'DAI/USD',
    baseAsset: 'DAI',
    quoteAsset: 'USD',
    name: 'Dai',
    isActive: false,
    category: PAIR_CATEGORIES.STABLE_COINS,
    logoUrl: 'https://assets.coincap.io/assets/icons/dai@2x.png',
    chainType: CHAIN_TYPES.EVM,
    decimals: 18,
    networks: [NETWORKS.ETHEREUM, NETWORKS.POLYGON],
    contractAddresses: {
      ethereum: '0x6b175474e89094c44da98b954eedeac495271d0f',
      polygon: '0x8f3cf7ad23cd3cadbd9735aff958023d60c4c9f1'
    }
  },
  {
    symbol: 'LINK/USDT',
    baseAsset: 'LINK',
    quoteAsset: 'USDT',
    name: 'Chainlink',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/link@2x.png',
    chainType: CHAIN_TYPES.EVM,
    decimals: 18,
    networks: [NETWORKS.ETHEREUM, NETWORKS.POLYGON],
    contractAddresses: {
      ethereum: '0x514910771af9ca656af840dff83e8264ecf986ca',
      polygon: '0x53e0bca35ec356bd5dddfebf6b0a0e4c1c2fb24b'
    }
  },
  {
    symbol: 'UNI/USDT',
    baseAsset: 'UNI',
    quoteAsset: 'USDT',
    name: 'Uniswap',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/uni@2x.png',
    chainType: CHAIN_TYPES.EVM,
    decimals: 18,
    networks: [NETWORKS.ETHEREUM, NETWORKS.POLYGON],
    contractAddresses: {
      ethereum: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      polygon: '0xb33eaad8d922b1083446dc23f610c28debe6c16b'
    }
  },
  {
    symbol: 'ATOM/USDT',
    baseAsset: 'ATOM',
    quoteAsset: 'USDT',
    name: 'Cosmos',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/atom@2x.png',
    decimals: 6,
  },
  {
    symbol: 'XLM/USDT',
    baseAsset: 'XLM',
    quoteAsset: 'USDT',
    name: 'Stellar',
    isActive: false,
    category: PAIR_CATEGORIES.CRYPTO,
    logoUrl: 'https://assets.coincap.io/assets/icons/xlm@2x.png',
    decimals: 7,
    contractAddresses: {}
  }
];

export const setupPairs = async function () {
  console.log('=====Setting up trading pairs=======');

  const Pair = model('Pair');

  try {
    const existingPairs = await Pair.find()
      .select('baseAsset')
      .lean();

    const existingPairAssets = existingPairs.map(pair => pair.baseAsset);

    const pairsToInsert = initialPairs.filter(pair => !existingPairAssets.includes(pair.baseAsset));

    if (pairsToInsert.length > 0) {
      await Pair.insertMany(pairsToInsert);

    } else {
      console.log('All trading pairs already exist.');
    }
  } catch (err) {
    console.error('Error setting up trading pairs:', err);
  }
};
