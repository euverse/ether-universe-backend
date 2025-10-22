import jwt from 'jsonwebtoken';

export default defineEventHandler(async (event) => {
    if (event.context.skipAuth) return;

    const plainPath = event.path.replace('/api/', '/');

    if (plainPath.startsWith('/admin')) return;

    const accessToken = getHeader(event, 'authorization')?.split(' ')?.[1]?.trim();

    let jwtError;

    if (accessToken) {
        const accessTokenSecret = useRuntimeConfig().auth.user.accessTokenSecret;

        try {
            const decoded = jwt.verify(accessToken, accessTokenSecret)

            event.context.auth = decoded;
        } catch (error) {
            jwtError = error
        }
    }


    if (!plainPath.startsWith('/auth')) {
        if (jwtError || !event.context.auth?.user) {
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
        }

    }
});

