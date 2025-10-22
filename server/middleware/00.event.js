

export default defineEventHandler(async event => {
    const unauthenticated = ['/ws', '/health','/firewall', '/ip', '/test'];

    const plainPath = event.path.replace('/api/', '/');

    if (unauthenticated.some(pathStart => plainPath.startsWith(pathStart))) {
        event.context.skipAuth = true
    }
})