import { USER_AUTH_STATUSES } from "~/db/schemas/User";

export default defineEventHandler(async (event) => {
    const userId = getRouterParam(event, 'id');

    const validStatuses = Object.values(USER_AUTH_STATUSES)

    const { status, attrs, biasedPositive } = await readAndValidateBody(event, {
        customValidators: {
            status: status => status ? validStatuses.includes(status) : true,
            attrs: attrs => attrs ? typeof attrs == 'object' : true
        }
    });

    try {
        const User = getModel('User');

        const updatedUser = await User.findByIdAndUpdate(userId, {
            ...(attrs && {
                ...Object.entries(attrs).reduce((attrs, [attr, value]) => {
                    attrs[`attrs.${attr}`] = value === 'undefined' ? undefined : value
                    return attrs
                }, {})
            }),
            ...(status && {
                'auth.status': status
            }),
            ...(typeof biasedPositive === 'boolean' && {
                'trading.biasedPositive': biasedPositive
            })
        }, {
            select: 'auth.status attrs trading.biasedPositive',
            returnDocument: 'after'
        });

        if (!updatedUser) {
            throw createError({
                statusCode: 404,
                statusMessage: 'User not found'
            });
        }

        return {
            status: updatedUser.auth.status,
            biasedPositive: updatedUser.trading.biasedPositive,
            attrs: updatedUser.attrs,
        };

    } catch (error) {
        if (error.statusCode) throw error;

        console.error('Update user error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: error.message || 'Failed to update user'
        });
    }
});