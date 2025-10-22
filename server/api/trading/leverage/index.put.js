export default defineEventHandler(async event => {
    const { accountId, leverage } = await readAndValidateBody(event, {
        include: ['accountId', 'leverage']
    });


    const TradingAccount = getModel('TradingAccount')

    const account = await TradingAccount.findByIdAndUpdate(accountId, {
        leverage
    }, {
        returnDocument: "after",
        select: "leverage"
    })

    if (!account) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Trading Account not found'
        })
    }

    return {
        accountId,
        leverage: account.leverage || 0
    }
})