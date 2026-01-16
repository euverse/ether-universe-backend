import { defineNitroConfig } from "nitropack/config"
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env') })

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
      BASE_URL: process.env.NITRO_BASE_URL || '',
      WWW_BASE_URL: process.env.NITRO_WWW_BASE_URL || '',
    },
    MONGODB_URI: process.env.NITRO_MONGODB_URI || '',
    MASTER_MNEMONIC: process.env.NITRO_MASTER_MNEMONIC || '',
    BINANCE_TICKER_URL: process.env.NITRO_BINANCE_TICKER_URL || '',
    COIN_GECKO_API_KEY1: process.env.NITRO_COIN_GECKO_API_KEY1 || '',
    COIN_GECKO_API_KEY2: process.env.NITRO_COIN_GECKO_API_KEY2 || '',
    ABSTRACT_API_KEY: process.env.NITRO_ABSTRACT_API_KEY || '',
    auth: {
      user: {
        refreshTokenSecret: process.env.NITRO_AUTH_USER_REFRESH_TOKEN_SECRET || '',
        accessTokenSecret: process.env.NITRO_AUTH_USER_ACCESS_TOKEN_SECRET || '',
      },
      admin: {
        refreshTokenSecret: process.env.NITRO_AUTH_ADMIN_REFRESH_TOKEN_SECRET || '',
        accessTokenSecret: process.env.NITRO_AUTH_ADMIN_ACCESS_TOKEN_SECRET || '',
      },
      passwordResetSecret: process.env.NITRO_AUTH_PASSWORD_RESET_SECRET || '',
      credentials: {
        adminFullName: process.env.NITRO_AUTH_CREDENTIALS_ADMIN_FULL_NAME || '',
        adminEmail: process.env.NITRO_AUTH_CREDENTIALS_ADMIN_EMAIL || '',
        adminPassword: process.env.NITRO_AUTH_CREDENTIALS_ADMIN_PASSWORD || '',
      },
      mail: {
        password: process.env.NITRO_AUTH_MAIL_PASSWORD || '',
      }
    },
    rpcUrls: {
      btc: process.env.NITRO_RPC_URLS_BTC || '',
      ethereum: process.env.NITRO_RPC_URLS_ETHEREUM || '',
      polygon: process.env.NITRO_RPC_URLS_POLYGON || '',
    },
  }
})