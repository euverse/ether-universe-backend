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
            throw createError({ statusCode: 403, statusMessage: 'Forbidden: Admin access required' });
        }

        if (!Object.values(ADMIN_ROLES).includes(sessionAdmin.role)) {
            throw createError({ statusCode: 403, statusMessage: 'Forbidden: Insufficient privileges' });
        }

        event.context.auth = decoded;
        event.context.admin = sessionAdmin;

    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            // Try to refresh the token using refresh token from cookies or headers
            let refreshToken = getCookie(event, 'refreshToken');
            
            // Also check for refresh token in Authorization header (as backup)
            if (!refreshToken) {
                const refreshHeader = getHeader(event, 'x-refresh-token');
                refreshToken = refreshHeader?.trim();
            }

            if (!refreshToken) {
                throw createError({ 
                    statusCode: 401, 
                    statusMessage: 'Token expired. Please log in again.',
                    data: { requiresReauth: true }
                });
            }

            try {
                const refreshTokenSecret = useRuntimeConfig(event).auth?.admin?.refreshTokenSecret;
                
                if (!refreshTokenSecret) {
                    console.error('Refresh token secret not configured');
                    throw new Error('Token refresh not configured');
                }

                const refreshDecoded = jwt.verify(refreshToken, refreshTokenSecret);

                // Ensure the decoded token has admin data
                if (!refreshDecoded.admin) {
                    throw new Error('Invalid refresh token structure');
                }

                // Generate new access token
                const accessTokenSecret = useRuntimeConfig(event).auth?.admin?.accessTokenSecret;
                const newAccessToken = jwt.sign(
                    { admin: refreshDecoded.admin },
                    accessTokenSecret,
                    { expiresIn: '15m' }
                );

                // Set new token in response header for client to capture
                setHeader(event, 'x-access-token', newAccessToken);
                
                // Also set in cookie for convenience
                setCookie(event, 'accessToken', newAccessToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 15 * 60 // 15 minutes
                });

                console.log('[AUTH] Token refreshed successfully for admin:', refreshDecoded.admin.id);

                event.context.auth = { admin: refreshDecoded.admin };
                event.context.admin = refreshDecoded.admin;

            } catch (refreshErr) {
                console.error('[AUTH] Token refresh failed:', refreshErr.message);
                throw createError({ 
                    statusCode: 401, 
                    statusMessage: 'Token expired. Please log in again.',
                    data: { requiresReauth: true }
                });
            }
        } else if (err.statusCode) {
            throw err;
        } else {
            console.error('[AUTH] Token validation error:', err.message);
            throw createError({ statusCode: 401, statusMessage: 'Invalid token' });
        }
    }
});