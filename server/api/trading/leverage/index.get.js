
export default defineEventHandler(async event => {
    const { accountId } = await getValidatedQuery(event, async query => {
        if (!query.accountId) {
            throw createError({
                statusCode: 400,
                statusMessage: "Trading Account id is required"
            })
        }
    })

    const TradingAccount = getModel('TradingAccount')

    const account = await TradingAccount.findById(accountId)
        .select('leverage')
        .lean()

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