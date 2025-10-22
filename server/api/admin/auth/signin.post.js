import bcrypt from 'bcrypt';

export default defineEventHandler(async (event) => {
    const { email, password } = await readAndValidateBody(event, {
        include: ['email', 'password']
    });

    const Admin = getModel('Admin');

    try {
        const admin = await Admin.findOne({ email: email.toLowerCase() });

        if (!admin) {
            throw createError({
                statusCode: 401,
                statusMessage: 'Invalid credentials'
            });
        }

        if (!admin.auth.isActive) {
            throw createError({
                statusCode: 403,
                statusMessage: 'Account is deactivated'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, admin.auth.password);

        if (!isPasswordValid) {
            throw createError({
                statusCode: 401,
                statusMessage: 'Invalid credentials'
            });
        }

        const { refreshToken, accessToken, issuedAt, expiresIn } = createAdminSession(admin, { refresh: false })

        admin.auth.refreshToken = refreshToken;
        admin.auth.lastLoggedInAt = issuedAt
        await admin.save();

        return {
            accessToken,
            refreshToken,
            expiresIn
        };

    } catch (error) {
        if (error.statusCode) throw error;

        console.error('Admin login error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Login failed'
        });
    }
});