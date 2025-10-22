

export default defineEventHandler(async (event) => {
    const sessionUser = event.context.auth?.user;

    const userId = sessionUser._id;

    const User = getModel('User');

    const user = await User.findById(userId)
        .select('security.requirePin security.privacyMode')
        .lean();

    if (!user) {
        throw createError({
            statusCode: 404,
            statusMessage: 'User not found.'
        });
    }

    const security = user.security || {};

    return {
        requirePin: security.requirePin ?? false,
        privacyMode: security.privacyMode ?? false
    };
});
