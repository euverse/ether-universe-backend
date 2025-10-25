import { WITHDRAWAL_STATUSES } from "~/db/schemas/UserWithdrawal";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 20;
        const status = query.status || WITHDRAWAL_STATUSES.PENDING;

        const UserWithdrawal = getModel('UserWithdrawal');

        const filter = { status };

        const skip = (page - 1) * limit;
        const withdrawals = await UserWithdrawal.find(filter)
            .populate("user pair")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalItems = await UserWithdrawal.countDocuments(filter);
        const totalPages = Math.ceil(totalItems / limit);

        return {
            withdrawals: withdrawals.map(formatWithdrawal),
            pagination: {
                currentPage: page,
                totalPages,
                totalItems,
                itemsPerPage: limit
            }
        };

    } catch (error) {
        console.error("Error:", error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to fetch deposits'
        });
    }
});


const formatWithdrawal = (withdrawal) => {
    const userName = `${withdrawal.user.personalInfo?.firstName || 'Unverified User'}`

    return {
        _id: withdrawal._id,
        userName,
        userStatus: withdrawal.user.auth.status,
        userId: withdrawal.user._id,
        pair: {
            baseAsset: withdrawal.pair.baseAsset,
            logoUrl: withdrawal.pair.logoUrl,
        },
        amount: withdrawal.requestedAmount,
        createdAt: withdrawal.createdAt,
    }
}