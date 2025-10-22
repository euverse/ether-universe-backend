
export default defineNitroPlugin((nitroApp) => {
  console.log('[WebSocket Plugin] Initializing WebSocket system...')
  
  // Initialize the store
  console.log('[WebSocket Plugin] WebSocket store ready')
  
  // Optional: Setup periodic stats logging
  setInterval(() => {
    const stats = wsStore.getStats()
    if (stats.activeUsers > 0 || stats.activeAdmins > 0) {
      console.log('[WebSocket Stats]', stats)
    }
  }, 30000) // Every 30 seconds
})