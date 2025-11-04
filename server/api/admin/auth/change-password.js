import jwt from 'jsonwebtoken';
import bcrypt from "bcrypt";
import { sendAdminPasswordResetConfirmation } from '~/services/mails';

export default defineEventHandler(async (event) => {

    const { password, token } = await readAndValidateBody(event, {
        include: ['password', 'token'],
        strict: true
    })

    const runtimeConfig = useRuntimeConfig()

    let decoded;
    try {

        decoded = jwt.verify(token, runtimeConfig.auth.passwordResetSecret);
    } catch (jwtError) {

        if (jwtError.message === 'jwt expired') {
            throw createError({
                statusCode: 401,
                statusMessage: 'Expired Link'
            })
        }

        throw createError({
            statusCode: 401,
            statusMessage: 'Invalid Link'
        })
    }


    const Admin = getModel('Admin')

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const admin = await Admin.findByIdAndUpdate(decoded._id,
        {
            'auth.password': hashedPassword
        })


    const getRequestInfo = (req) => {
        const userAgent = req.headers['user-agent'];

        const browserInfo = {
            browser: userAgent.match(/(?:firefox|opera|chrome|safari|msie|trident(?=\/))\/?\s*(\d+)/i)?.[0] || 'Unknown Browser',
            os: userAgent.match(/\((.*?)\)/)?.[1] || 'Unknown OS',
        };

        return browserInfo;
    };

    const { browser, os } = getRequestInfo(event.node.req)

    const ip = getRequestIP(event, { xForwardedFor: true })

    await sendAdminPasswordResetConfirmation(admin.email, { ip, browser, os })

})