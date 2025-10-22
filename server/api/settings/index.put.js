
const User = getModel('User');

export default defineEventHandler(async (event) => {
    const sessionUser = event.context.auth?.user;

    const userId = sessionUser._id;

    const {
        theme,
        language,
        notifications,
        emailAlerts,
        smsAlerts,
        twoFactorAuth,
        riskManagement,
        maxLeverage,
        autoCloseTrades
    } = await readAndValidateBody(event, {
        customValidators: {
            maxLeverage: maxLeverage => maxLeverage ? typeof maxLeverage === 'number' &&
                (maxLeverage > 1 || maxLeverage < 100) : true
        }
    });


    const userUpdateDetails = {
        ...(
            typeof theme === 'string' && {
                'settings.theme': theme
            }
        ),
        ...(
            typeof language === 'string' && {
                'settings.language': language
            }
        ),
        ...(
            typeof notifications === 'boolean' && {
                'settings.notifications': notifications
            }
        ),
        ...(
            typeof emailAlerts === 'boolean' && {
                'settings.emailAlerts': emailAlerts
            }
        ),
        ...(
            typeof smsAlerts === 'boolean' && {
                'settings.smsAlerts': smsAlerts
            }
        ),
        ...(
            typeof twoFactorAuth === 'boolean' && {
                'auth.google2fa': twoFactorAuth
            }
        ),
        ...(
            typeof riskManagement === 'string' && {
                'trading.riskManagement': riskManagement
            }
        ),
        ...(
            typeof maxLeverage === 'number' && {
                'trading.maxLeverage': maxLeverage
            }
        ),
        ...(
            typeof autoCloseTrades === 'boolean' && {
                'trading.autoCloseTrades': autoCloseTrades
            }
        )
    };

    const updatedUser = await User.findByIdAndUpdate(userId, userUpdateDetails, { returnDocument: 'after' })

    if (!updatedUser) {
        throw createError({
            statusCode: 404,
            statusMessage: 'User not found or update failed.'
        });
    }

    const settings = updatedUser.settings || {};
    const trading = updatedUser.trading || {};
    const auth = updatedUser.auth || {};

    return {
        theme: settings.theme,
        language: settings.language,
        notifications: settings.notifications,
        emailAlerts: settings.emailAlerts,
        smsAlerts: settings.smsAlerts,
        twoFactorAuth: auth.google2fa,
        riskManagement: trading.riskManagement,
        maxLeverage: trading.maxLeverage,
        autoCloseTrades: trading.autoCloseTrades
    };
});
