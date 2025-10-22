

export default defineEventHandler(async event => {

    const sessionUser = event.context.user.auth;

    const { type: accountType } = readAndValidateBody(event, { include: ['type'] })

    const TradingAccount = getModel('TradingAccount');

    const tradingAccount = await TradingAccount.create({
        user: sessionUser?._id,
        type: accountType
    })

    await tradingAccount.initiateWallets()

    return tradingAccount
})