

const User = getModel('User');

export default defineEventHandler(async (event) => {
    const sessionUser = event.context.auth?.user;

    const userId = sessionUser._id;

    const user = await User.findById(userId)
        .select('settings auth.google2fa trading.maxLeverage trading.autoCloseTrades trading.riskManagement')
        .lean();

    if (!user) {
        throw createError({
            statusCode: 404,
            statusMessage: 'User settings not found.'
        });
    }

    const settings = user.settings || {};
    const auth = user.auth || {};
    const trading = user.trading || {};

    return {
        theme: settings.theme || 'dark',
        language: settings.language || 'en',
        notifications: settings.notifications ?? true,
        emailAlerts: settings.emailAlerts ?? true,
        smsAlerts: settings.smsAlerts ?? false,
        twoFactorAuth: auth.google2fa ?? false,
        riskManagement: trading.riskManagement || 'high',
        maxLeverage: trading.maxLeverage ?? 20,
        autoCloseTrades: trading.autoCloseTrades ?? false
    };
});
