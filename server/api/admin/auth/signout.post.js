

export default defineEventHandler(async (event) => {
    const sessionAdmin = event.context.auth?.admin;

    try {
        const Admin = getModel('Admin');

        await Admin.findByIdAndUpdate(sessionAdmin._id, {
            'auth.refreshToken': null
        });

        return {
            message: 'Successfully signed out'
        };
    } catch (error) {
        console.error('Signout error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Signout failed'
        });
    }
});