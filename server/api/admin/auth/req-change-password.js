import jwt from "jsonwebtoken";
import { sendAdminPasswordReset } from "~/services/mails";

export default defineEventHandler(async (event) => {
    const sessionAdmin = event.context.auth.admin;

    const Admin = getModel('Admin');

    const admin = await Admin.findById(sessionAdmin._id);

    if (!admin) {
        throw createError({
            statusCode: 404,
            statusMessage: "Admin not found"
        })
    }

    const resetLink = getResetLink(admin._id)


    const email = admin.email

    await sendAdminPasswordReset(email, { resetLink })

    return {
        email: email
    }

})

function getResetLink(_id) {
    const runtimeConfig = useRuntimeConfig()
    const passwordResetSecret = runtimeConfig.auth.passwordResetSecret
    const token = jwt.sign({ _id }, passwordResetSecret, {
        expiresIn: '15m'
    })

    const resetLink = `${runtimeConfig.public.APP_BASE_URL}/admin/auth/change-password?token=${token}`;

    return resetLink;
}
