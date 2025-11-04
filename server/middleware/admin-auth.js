import jwt from 'jsonwebtoken';
import { ADMIN_ROLES } from '../db/schemas/Admin';

export default defineEventHandler(async (event) => {
    if (event.context.skipAuth) return;

    const plainPath = event.path.replace('/api/', '/');

    if (!plainPath.startsWith('/admin')) {
        return;
    }

    const freeRoutes = [
        '/admin/auth/signin',
        '/admin/auth/refresh-token'
    ]

    if (freeRoutes.includes(plainPath)) return;

    const accessToken = getHeader(event, 'authorization')?.split(' ')?.[1]?.trim();

    if (!accessToken) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized: No token provided' });
    }

    try {
        const accessTokenSecret = useRuntimeConfig(event).auth?.admin?.accessTokenSecret;
        const decoded = jwt.verify(accessToken, accessTokenSecret);

        const sessionAdmin = decoded.admin;

        if (!sessionAdmin) {
            throw createError({ statusCode: 401, statusMessage: 'Forbidden: Admin access required' });
        }

        if (!Object.values(ADMIN_ROLES).includes(sessionAdmin.role)) {
            throw createError({ statusCode: 401, statusMessage: 'Forbidden: Insufficient privileges' });
        }

        event.context.auth = decoded;
        event.context.admin = sessionAdmin;

    } catch (err) {
        throw createError({ statusCode: 401, statusMessage: 'Invalid or expired token' });
    }
});