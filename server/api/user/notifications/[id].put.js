export default defineEventHandler(async event => {
    const { hasRead, remindAt } = await readBody(event);
    const notificationId = getRouterParam(event, "id");
    const sessionUser = event.context.auth.user;
    const Notification = getModel("Notification");

    const notification = await Notification.findById(notificationId);

    if (!notification) {
        throw createError({
            statusCode: 404,
            statusMessage: "Notification not found"
        });
    }

    // General notifications cannot be updated by user
    if (!notification.user) {
        throw createError({
            statusCode: 403,
            statusMessage: "Cannot update general notifications"
        });
    }

    // Verify ownership
    if (notification.user.toString() !== sessionUser._id.toString()) {
        throw createError({
            statusCode: 403,
            statusMessage: "Unauthorized"
        });
    }

    if (hasRead) {
        notification.readAt = new Date();
    }

    if (remindAt && notification.reminder.isEnabled) {
        notification.reminder.remindAt = remindAt;
    }

    await notification.save();

    return {
        success: true
    };
});