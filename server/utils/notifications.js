
const Notification = getModel("Notification")



export const createNotification = async (...notificationDetails) => {
    try {
        const notification = await Notification.create(notificationDetails)

        return notification
    } catch (error) {
        console.error(error)
    }
}