import { getModel } from '~/db/models/register.js';

export default defineEventHandler(async (event) => {
    const admin = event.context.auth?.admin;
    
    if (!admin) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized'
        });
    }
    
    const userId = getRouterParam(event, 'userId');
    const { content } = await readBody(event);
    
    if (!userId) {
        throw createError({
            statusCode: 400,
            statusMessage: 'userId is required'
        });
    }
    
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Note content is required and must be a non-empty string'
        });
    }
    
    if (content.length > 5000) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Note content cannot exceed 5000 characters'
        });
    }
    
    try {
        const User = getModel('User');
        const Chat = getModel('Chat');
        
        const user = await User.findById(userId);
        if (!user) {
            throw createError({
                statusCode: 404,
                statusMessage: 'User not found'
            });
        }
        
        let chat = await Chat.findOne({ user: userId });
        
        if (!chat) {
            chat = await Chat.create({
                user: userId,
                messages: [],
                notes: []
            });
        }
        
        await chat.addNote({ textContent: content.trim() });
        
        return {
            message: 'successful',
            note: {
                userId: userId,
                content: content.trim(),
                createdAt: new Date()
            }
        };
        
    } catch (error) {
        if (error.statusCode) throw error;
        
        console.error('Add chat note error:', error);
        throw createError({
            statusCode: 500,
            statusMessage: error.message || 'Failed to add note'
        });
    }
});