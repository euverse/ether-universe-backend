

export default defineEventHandler(async (event) => {
    const admin = event.context.admin;

    if (!admin) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }

    const userId = event.context.params.userId;
    const { status } = await readBody(event);
    const validStatuses = ['active', 'frozen', 'suspended'];
    if (!status || !validStatuses.includes(status)) {
        throw createError({
            statusCode: 400,
            statusMessage: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
    }

    try {
        const User = getModel('User');
        const user = await User.findByIdAndUpdate(
            userId,
            { 
                accountStatus: status,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!user) {
            throw createError({
                statusCode: 404,
                statusMessage: 'User not found'
            });
        }

        return {
            userId: user._id,
            status: user.accountStatus,
            updatedAt: user.updatedAt
        };

    } catch (error) {
        if (error.statusCode) throw error;

        console.error('Update user status error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to update user status'
        });
    }
});