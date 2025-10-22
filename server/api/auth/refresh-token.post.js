import jwt from 'jsonwebtoken';

const User = getModel('User');

export default defineEventHandler(async (event) => {
    const { refreshToken } = await readAndValidateBody(event, {
        include: ['refreshToken'],
    });

    if (!refreshToken) {
        throw createError({
            statusCode: 400,
            message: 'Refresh token is required',
        });
    }

    let decoded;

    try {
        const authConfig = useRuntimeConfig().auth?.user || {};
        const refreshTokenSecret = authConfig.refreshTokenSecret;

        decoded = jwt.verify(refreshToken, refreshTokenSecret);
    } catch (err) {
        throw createError({
            statusCode: 401,
            message: 'Invalid or expired refresh token',
        });
    }

    const user = await User.findById(decoded?.user?._id);

    if (!user) {
        throw createError({
            statusCode: 404,
            message: 'User not found',
        });
    }

    if (user.auth?.refreshToken !== refreshToken) {
        throw createError({
            statusCode: 401,
            message: 'Refresh token does not match',
        });
    }

    const { accessToken, expiresIn } = createUserSession(user);

    return {
        accessToken,
        expiresIn
    };
});
