import jwt from 'jsonwebtoken';

export default defineEventHandler(async (event) => {
    const { refreshToken } = await readAndValidateBody(event, {
        include: ['refreshToken']
    });

    const config = useRuntimeConfig(event).auth?.admin || {};
    const refreshTokenSecret = config.refreshTokenSecret;

    try {
        let decoded;

        try {
            decoded = jwt.verify(refreshToken, refreshTokenSecret);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw createError({
                    statusCode: 401,
                    statusMessage: 'Refresh token expired'
                });
            }
        }

        const sessionAdmin = decoded.admin;

        if (!sessionAdmin) {
            throw createError({
                statusCode: 403,
                statusMessage: 'Invalid token type'
            });
        }

        const Admin = getModel('Admin');
        const admin = await Admin.findById(sessionAdmin._id);

        if (!admin || admin.auth.refreshToken !== refreshToken) {
            throw createError({
                statusCode: 401,
                statusMessage: 'Invalid refresh token'
            });
        }

        if (!admin.auth.isActive) {
            throw createError({
                statusCode: 403,
                statusMessage: 'Account is deactivated'
            });
        }

        const { accessToken, expiresIn } = createAdminSession(admin)

        return {
            accessToken,
            expiresIn
        };

    } catch (error) {
        if (error.statusCode) throw error;

        throw createError({
            statusCode: 401,
            statusMessage: 'Invalid refresh token'
        });
    }
});