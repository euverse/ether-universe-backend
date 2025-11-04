

export default defineEventHandler(async event => {
    const unauthenticated = ['/ws', '/health', '/firewall', '/ip', '/test'];

    const plainPath = event.path.replace('/api/', '/');

    event.context.plainPath = plainPath;
    event.context.isAdminRoute = plainPath.startsWith('/admin')

    if (unauthenticated.some(pathStart => plainPath.startsWith(pathStart))) {
        event.context.skipAuth = true
    }
})