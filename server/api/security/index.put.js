


export default defineEventHandler(async (event) => {
    const userId = event.context.auth?.user?._id;

    const body = await readAndValidateBody(event, {
        customValidators: {
            requirePin: requirePin => requirePin ? typeof requirePin === 'boolean' : true,
            privacyMode: privacyMode => privacyMode ? typeof privacyMode === 'boolean' : true,
        }
    });

    const { requirePin, privacyMode } = body;

    const securityUpdateDetails = {
        ...(typeof requirePin === 'boolean' && { 'security.requirePin': requirePin }),
        ...(typeof privacyMode === 'boolean' && { 'security.privacyMode': privacyMode }),
    };

    console.log({ securityUpdateDetails })

    const User = getModel('User');

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        securityUpdateDetails,
        {
            returnDocument: 'after',
            select: 'security'
        }
    ).lean();

    if (!updatedUser) {
        throw createError({ statusCode: 404, statusMessage: 'User not found or update failed.' });
    }

    const security = updatedUser.security || {};

    return {
        requirePin: security.requirePin,
        privacyMode: security.privacyMode
    };
});