// server/api/admin/users/[userId].put.js
import mongoose from 'mongoose';

export default defineEventHandler(async (event) => {
    const admin = event.context.admin;
    
    if (!admin) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }

    // Get userId from params - match the filename case exactly
    const userId = event.context.params.userId;
    
    if (!userId) {
        throw createError({
            statusCode: 400,
            statusMessage: 'User ID is required'
        });
    }

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid user ID format'
        });
    }

    const body = await readBody(event);
    const { status } = body;
    
    const validStatuses = ['active', 'frozen', 'suspended'];
    if (!status || !validStatuses.includes(status)) {
        throw createError({
            statusCode: 400,
            statusMessage: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
    }

    try {
        const User = getModel('User');
        
        console.log(`[ADMIN] Updating user ${userId} status to ${status}`);
        
        const user = await User.findByIdAndUpdate(
            userId,
            { 
                accountStatus: status,
                updatedAt: new Date()
            },
            { new: true, runValidators: true }
        );

        if (!user) {
            throw createError({
                statusCode: 404,
                statusMessage: 'User not found'
            });
        }

        console.log(`[ADMIN] Successfully updated user ${userId}`);
        
        return {
            success: true,
            userId: user._id,
            status: user.accountStatus,
            updatedAt: user.updatedAt
        };
    } catch (error) {
        // Don't catch H3 errors
        if (error.statusCode) throw error;
        
        console.error('Update user status error:', error.message);
        console.error('Stack:', error.stack);
        
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to update user status',
            data: {
                error: error.message
            }
        });
    }
});