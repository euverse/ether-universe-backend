
export default defineEventHandler(async event => {
    // await sleep(8000)

    return {
        isAllowed: true
    }

    //ip
    const BlackListedIp = getModel("BlackListedIp");

    const requestIp = getRequestIP(event, { xForwardedFor: true })

    const isblackListed = await BlackListedIp.exists({ ip: requestIp })

    if (isblackListed) {
        return {
            isAllowed: false
        }
    }

    const ipData = await event.$fetch("/api/ip")

    const whiteListedCountryCodes = ["US"]

    const isAllowed =
        ipData?.country_code &&
        whiteListedCountryCodes.includes(ipData.country_code) &&
        ipData?.security?.is_vpn === false;

    if (!isAllowed) {
        await BlackListedIp.create({
            ip: ipData.ip_address
        })
    }

    return {
        isAllowed
    }
})