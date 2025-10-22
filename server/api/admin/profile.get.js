
import { ADMIN_ROLES } from "~/db/schemas/Admin";

export default defineEventHandler(async (event) => {
  try {
    const sessionAdmin = event.context.auth?.admin;
    
    // Validate session exists
    if (!sessionAdmin?._id) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized: No admin session found'
      });
    }

    const Admin = getModel('Admin');
    const admin = await Admin.findById(sessionAdmin._id).select(
      '_id fullName avatarUrl permissions.role'
    );

    if (!admin) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Admin not found'
      });
    }

    // Determine role with fallback
    const roleValue = admin.permissions?.role || ADMIN_ROLES.ADMIN;
    const displayRole = roleValue === ADMIN_ROLES.SUPER_ADMIN ? 'Super Admin' : 'Admin';

    return {
      _id: admin._id,
      fullName: admin.fullName || '',
      avatarUrl: admin.avatarUrl || null,
      role: displayRole
    };
  } catch (error) {
    console.error('Error fetching admin profile:', error);
    throw error;
  }
});