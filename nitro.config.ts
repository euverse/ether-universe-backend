import { defineNitroConfig } from "nitropack/config"

// https://nitro.build/config
export default defineNitroConfig({
  compatibilityDate: "latest",
  srcDir: "server",
  imports: {
    autoImport: true
  },
  experimental: {
    websocket: true
  },
  runtimeConfig: {
    public: {
      BASE_URL: process.env.BASE_URL
    },
    auth: {
      user: {
        refreshTokenSecret: process.env.USER_REFRESH_TOKEN_SECRET,
        accessTokenSecret: process.env.USER_ACCESS_TOKEN_SECRET,
      },
      admin: {
        refreshTokenSecret: process.env.ADMIN_REFRESH_TOKEN_SECRET,
        accessTokenSecret: process.env.ADMIN_ACCESS_TOKEN_SECRET,
      },
      credentials: {
        adminFullName: process.env.ADMIN_FULLNAME,
        adminEmail: process.env.ADMIN_EMAIL,
        adminPassword: process.env.ADMIN_PASSWORD
      }
    },
    rpcUrls: {
      btc: process.env.BITCOIN_MAINNET_RPC_URL,
      ethereum: process.env.ETHEREUM_MAINNET_RPC_URL,
      polygon: process.env.POLYGON_MAINNET_RPC_URL
    },
    BINANCE_TICKER_URL: process.env.BINANCE_TICKER_URL,
    COIN_GECKO_API_KEY: process.env.COIN_GECKO_API_KEY,
    MONGODB_URI: process.env.MONGODB_URI,
    ABSTRACT_API_KEY: process.env.ABSTRACT_API_KEY,
  }
});

