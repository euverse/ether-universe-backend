const TradingAccount = getModel('TradingAccount');

export default defineEventHandler(async event => {
  const sessionUser = event.context.auth.user;

  const tradingAccounts = await TradingAccount.find({ user: sessionUser._id });

  // Calculate USDT balances for all accounts
  const accountsWithBalances = await Promise.all(
    tradingAccounts.map(async (account) => {
      let balanceUsdt = "0.00";

      try {
        const usdtBalance = await getTradingAccountUSDTBalance(account._id);
        balanceUsdt = parseFloat(usdtBalance.totals.available).toFixed(2);
      } catch (error) {
        // If USDT pair not found or no balance, default to "0.00"
        console.error(`Error fetching USDT balance for account ${account._id}:`, error.message);
      }

      return formatTradingAccount(account, balanceUsdt);
    })
  );

  return {
    accounts: accountsWithBalances
  };
});

const formatTradingAccount = (tradingAccount, balanceUsdt) => ({
  _id: tradingAccount._id,
  type: tradingAccount.type,
  balanceUsdt: balanceUsdt,
  equity: tradingAccount.equity,
  leverage: tradingAccount.leverage,
  margin: tradingAccount.margin,
  freeMargin: tradingAccount.freeMargin,
  marginLevel: tradingAccount.marginLevel,
  isActive: tradingAccount.isActive,
  createdAt: tradingAccount.createdAt,
  updatedAt: tradingAccount.updatedAt,
});