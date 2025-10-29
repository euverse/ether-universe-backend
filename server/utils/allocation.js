import { ACCOUNT_TYPES } from "../db/schemas/TradingAccount";

/**
 * Create a new asset allocation for a user
 */
export async function createAllocation(userId, baseAsset, amount) {

    const Pair = getModel("Pair")


    const pair = await Pair.findOne({ baseAsset })

    if (!pair) {
        throw Error("Pair not found")
    }

    if (!pair.isActive) {
        throw Error("Pair is not active")
    }

    const TradingAccount = getModel('TradingAccount');

    const userRealAccount = await TradingAccount.findOne({
        user: userId,
        type: ACCOUNT_TYPES.REAL
    })

    if (!userRealAccount) {
        throw Error('User has no real trading account')
    }

    const AssetAllocation = getModel('AssetAllocation');

    const allocation = await AssetAllocation.create({
        user: userId,
        tradingAccount: userRealAccount._id,
        pair: pair._id,
        amount
    });

    const allocatedSmallest = toSmallestUnit(amount, pair.decimals);

    const Wallet = getModel('Wallet');
    const wallets = await Wallet.find({ tradingAccount: userRealAccount._id }).select('_id').lean();;
    const walletIds = wallets.map(w => w._id);

    const Balance = getModel('Balance');

    const balance = await Balance.findOne({
        wallet: { $in: walletIds },
        pair: pair._id,
    });


    const errors = [];

    if (!balance) {
        errors.push(`No balance record found for pair`);
    }

    balance.totalAllocated = add(balance.totalAllocated, allocatedSmallest);
    balance.lastAllocated = new Date();

    return {
        allocation,
        errors
    };
}


export async function getAssetAllocation(tradingAccountId, pairId) {
    try {
        if (!tradingAccount) {
            throw Error("Trading account not found")
        }

        const TradingAccount = getModel('TradingAccount');

        const tradingAccount = await TradingAccount.findById(tradingAccountId)

        if (!tradingAccount) {
            throw Error("Trading account not found")
        }

        const AssetAllocation = getModel('AssetAllocation');

        const allocations = await AssetAllocation.find({
            tradingAccount: tradingAccountId,
            pair: pairId
        })

        if (allocations.length === 0) return {};
        else {
            return allocations.reduce((acc, allocation) => ({
                amount: add(acc.amount || 0, allocation.amount),
                amountSmallest: add(acc.amountSmallest || 0, allocation.amount)
            }), {})
        }

    } catch (error) {
        console.error('Error')
        return {}

    }
}

/**
 * Get allocation history for a user
 */
export async function getUserAllocations(userId, limit = 10) {
    const AssetAllocation = getModel('AssetAllocation');

    const allocations = await AssetAllocation.find({
        user: userId
    })
        .populate('pair')
        .sort({ createdAt: -1 })
        .limit(limit);

    return allocations;
}