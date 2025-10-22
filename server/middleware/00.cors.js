export default defineEventHandler((event) => {
    // Set CORS headers for all requests
    setResponseHeaders(event, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
        'Access-Control-Allow-Credentials': 'true'
    })

    // Handle OPTIONS preflight requests
    if (event.method === 'OPTIONS') {
        sendNoContent(event)
    }
})