
export default defineEventHandler(async (event) => {
  //TEST ONLY: "15.204.166.122" || "8.8.8.8" 
  const requestIp = getRequestIP(event, { xForwardedFor: true })
  const { ip = requestIp } = getQuery(event)

  if (!ip) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ip is required'
    })
  }


  const ipData = await $fetch(`https://ipgeolocation.abstractapi.com/v1`, {
    query: {
      api_key: useRuntimeConfig().ABSTRACT_API_KEY,
      ip_address: ip
    }
  });



  return ipData;

  // return await new Promise(resolve => setTimeout(() => resolve(ipData), 1000000));

})
