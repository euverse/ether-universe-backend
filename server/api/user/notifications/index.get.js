export default defineEventHandler(async event => {
    try {
        const sessionUser = event.context.auth.user;
        const Notification = getModel('Notification');

        console.log({
            ...sessionUser
        })

        const now = new Date();
        const userFilter = { $or: [{ user: sessionUser._id }, { user: { $exists: false } }] }

        const query = {
            readAt: null,
            $and: [
                userFilter,
                {
                    $or: [
                        { 'reminder.remindAt': { $exists: true, $lte: now } },
                        { 'reminder.remindAt': { $exists: false } }
                    ]
                }
            ]
        };

        const notifications = await Notification.find(query)
            .sort({ priority: -1, createdAt: -1 })
            .lean();

        return {
            notifications
        };
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return {
            success: false,
            message: 'Failed to fetch notifications'
        };
    }
});