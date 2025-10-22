import jwt from 'jsonwebtoken';

export const createUserSession = (user = null, { refresh = true, expiresIn = 3600 } = {}) => {
    const now = Date.now()

    const authConfig = useRuntimeConfig().auth?.user || {};
    const accessTokenSecret = authConfig.accessTokenSecret;

    const userAuthPayload = {
        user: {
            _id: user?._id,
            walletAddress: user?.walletAddress,
            currentTradingAccountId: user?.trading?.currentAccount,
        },
        session: {
            ...(refresh ? ({
                lastRefreshed: now
            }) : ({
                loggedInAt: now
            }))
        }
    }

    const accessToken = jwt.sign(userAuthPayload,
        accessTokenSecret,
        { expiresIn }
    );


    const authTokens = {
        issuedAt: now,
        accessToken,
        expiresIn
    }

    if (!refresh) {
        const refreshTokenSecret = authConfig.refreshTokenSecret;

        const refreshToken = jwt.sign(userAuthPayload, refreshTokenSecret,
            { expiresIn: '7d' }
        );

        authTokens.refreshToken = refreshToken
    }

    return authTokens;
}


export const createAdminSession = (admin = null, { refresh = true, expiresIn = 3600 } = {}) => {
    // Changed from 60 to 3600 (1 hour instead of 1 minute)
    const now = Date.now()

    const authConfig = useRuntimeConfig().auth?.admin || {}; // Changed from user to admin
    const accessTokenSecret = authConfig.accessTokenSecret;

    const adminAuthPayload = {
        admin: {
            _id: admin?._id,
            email: admin?.email,
            role: admin?.permissions?.role,
        },
        session: {
            ...(refresh ? ({
                lastRefreshed: now
            }) : ({
                loggedInAt: now
            }))
        }
    }

    const accessToken = jwt.sign(adminAuthPayload,
        accessTokenSecret,
        { expiresIn }
    );


    const authTokens = {
        issuedAt: now,
        accessToken,
        expiresIn
    }

    if (!refresh) {
        const refreshTokenSecret = authConfig.refreshTokenSecret;

        const refreshToken = jwt.sign(adminAuthPayload, refreshTokenSecret,
            { expiresIn: '7d' }
        );

        authTokens.refreshToken = refreshToken
    }

    return authTokens;
}