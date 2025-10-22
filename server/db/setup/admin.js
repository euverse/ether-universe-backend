import { model } from "mongoose";
import { ADMIN_ROLES } from "../schemas/Admin";
import bcrypt from "bcrypt"



const authCredentials = useRuntimeConfig().auth.credentials;

export const initialSuperAdmin = {
    email: authCredentials.adminEmail,
    password: authCredentials.adminPassword,
    fullName: authCredentials.adminFullName,
    role: ADMIN_ROLES.SUPER_ADMIN,
    avatarUrl: "https://i.pravatar.cc/150?img=1"
};


export async function setupSuperAdmin() {
    try {
        const Admin = model('Admin');

        const existingSuperAdmin = await Admin.findOne({
            'permissions.role': ADMIN_ROLES.SUPER_ADMIN
        });

        if (existingSuperAdmin) return;

        // Hash the password using bcrypt
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(initialSuperAdmin.password, saltRounds);

        // Create super admin
        const superAdmin = await Admin.create({
            email: initialSuperAdmin.email,
            fullName: initialSuperAdmin.fullName,
            avatarUrl: initialSuperAdmin.avatarUrl,
            permissions: {
                role: initialSuperAdmin.role
            },
            auth: {
                password: hashedPassword,
                isActive: true,
                lastLoggedInAt: null,
                refreshToken: null
            }
        });

        console.log('✅ Super admin created successfully');

    } catch (error) {
        console.error('❌ Error setting up super admin:', error);
    }
}
