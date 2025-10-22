
const User = getModel('User');

export default defineEventHandler(async event => {

    const sessionUser = event.context.auth.user || {};

    const updatedUser = await User.findByIdAndUpdate(sessionUser._id, {
        'auth.refreshToken': null
    }, {
        returnDocument: 'after'
    });

    if (!updatedUser) {
        throw createError({
            statusCode: 401,
            statusMessage: 'User not found'
        });
    }

    return {
        message: 'Successfully logged out'
    };
});
