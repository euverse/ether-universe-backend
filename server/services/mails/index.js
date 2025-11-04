import nodemailer from 'nodemailer';
import ejs from "ejs"
import securityTemplates from './templates/security';


const runtimeConfig = useRuntimeConfig();

function createTransport(from) {
    const auth = {
        user: `${from}@ether-universe.org`,
        pass: runtimeConfig.auth.mail.password
    }

    return nodemailer.createTransport({
        host: 'smtp.zoho.com',
        port: 465,
        secure: true,
        auth,
    });
}

async function sendMail({
    name,
    from,
    to,
    subject,
    html,
}) {


    const transporter = createTransport(from);

    return await transporter.sendMail({
        from: `"${name}" <${from}@ether-universe.org>`,
        to,
        subject,
        html,
    });
}


// Function to send credentials
export async function sendAdminPasswordReset(adminEmail, { resetLink }) {
    const emailHtml = await ejs.render(securityTemplates.adminPasswordReset, {
        resetLink,
    });

    // Send the email with the rendered HTML
    const info = await sendMail({
        name: 'Security',
        from: 'security',
        subject: 'Password Reset Link',
        to: adminEmail,
        html: emailHtml,
    });

    return info;
}

// Function to send credentials
export async function sendAdminPasswordResetConfirmation(adminEmail, { ip, os, browser } = {}) {
    const signInLink = `${runtimeConfig.public.APP_BASE_URL}/admin/auth/signin`

    const ipInfo = await $fetch('/api/ip', {
        query: {
            ip
        }
    })

    const {
        country = "Country Not Set",
        continent = "Continent Not Set",
        flag = {},
        timezone = {}
    } = ipInfo || {}

    const { emoji: countryFlagEmoji = "Flag Emoji Not Set" } = flag
    const { current_time = "Time Not Set", abbreviation = "Abbreviation Not Set" } = timezone

    const location = `${country} ${countryFlagEmoji}, ${continent}`;

    // Format the time nicely for email display
    const formattedTime = current_time.replace(/^(\d{2}):(\d{2}):(\d{2})$/, '$1:$2'); // removes seconds if needed

    const emailHtml = await ejs.render(securityTemplates.passwordResetConfirmation, {
        os,
        browser,
        time: {
            stamp: formattedTime,
            zone: abbreviation
        },
        location,
        signInLink
    });

    // Send the email with the rendered HTML
    const info = await sendMail({
        name: 'Security',
        from: 'security',
        subject: 'Password Reset Success',
        to: adminEmail,
        html: emailHtml,
    });

    return info;
}
