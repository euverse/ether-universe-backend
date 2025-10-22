
export default defineEventHandler(async (event) => {
    const admin = event.context.auth?.admin;
    
    if (!admin) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }
    
    const userId = getRouterParam(event, 'userId');
    const { status, attrs } = await readBody(event);
    
    if (!userId) {
        throw createError({
            statusCode: 400,
            statusMessage: 'userId is required'
        });
    }
    
    if (!status && !attrs) {
        throw createError({
            statusCode: 400,
            statusMessage: 'At least one of status or attrs must be provided'
        });
    }
    const validStatuses = ['active', 'freezed', 'suspended', 'banned'];
    if (status && !validStatuses.includes(status)) {
        throw createError({
            statusCode: 400,
            statusMessage: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
    }
    if (attrs && typeof attrs !== 'object') {
        throw createError({
            statusCode: 400,
            statusMessage: 'attrs must be an object'
        });
    }
    
    try {
        const User = getModel('User');
        
        const user = await User.findById(userId);
        if (!user) {
            throw createError({
                statusCode: 404,
                statusMessage: 'User not found'
            });
        }
        
        const updateObj = {};
        
        if (status) {
            updateObj.status = status;
        }
        
        if (attrs && Object.keys(attrs).length > 0) {
            // Initialize customAttributes if it doesn't exist
            if (!user.customAttributes) {
                user.customAttributes = {};
            }
            
            // Merge new attributes with existing ones
            updateObj.customAttributes = {
                ...user.customAttributes,
                ...attrs
            };
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updateObj },
            { new: true, runValidators: true }
        ).select('_id status customAttributes');
        
        return {
            message: 'successful',
            user: {
                userId: updatedUser._id,
                status: updatedUser.status,
                customAttributes: updatedUser.customAttributes || {},
                updatedAt: new Date()
            }
        };
        
    } catch (error) {
        if (error.statusCode) throw error;
        
        console.error('Update user error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: error.message || 'Failed to update user'
        });
    }
});