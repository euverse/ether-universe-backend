export default defineCachedEventHandler(async (event) => {
  const requestIp = getRequestIP(event, { xForwardedFor: true })

  const { ip } = await getValidatedQuery(event, query => {
    validateInput(query, {
      customValidators: {
        ip: ip => Boolean(requestIp || ip)
      }
    })

    return {
      ...query,
      ip: query.ip || requestIp
    }

  })


  const ipData = await $fetch(`https://ipgeolocation.abstractapi.com/v1`, {
    query: {
      api_key: useRuntimeConfig().ABSTRACT_API_KEY,
      ip_address: ip
    }
  });

  return ipData;
}, {
  getKey: (event) => {
    // Unique cache key per IP
    const { ip } = getQuery(event)
    const requestIp = getRequestIP(event, { xForwardedFor: true })
    return `cached-ip:${ip || requestIp}`
  },
  shouldCache: () => true,
  // “Indefinite” caching within server lifetime:
  maxAge: 60 * 60 * 24 * 365 * 10 // 10 years (practically indefinite)
})
