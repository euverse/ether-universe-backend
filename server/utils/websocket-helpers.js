import jwt from 'jsonwebtoken'

/**
 * Verify JWT token and extract user/admin info
 */
export const verifyJWT = (token, secret) => {
  if (!token || !secret) return null

  try {
    return jwt.verify(token, secret)
  } catch (error) {
    console.error('[WS] JWT verification failed:', error.message)
    return null
  }
}

/**
 * Check if peer connection is ready
 */
const isPeerReady = (peer) => {
  // console.log("Ready state for peer is ", peer.readyState)
  return true
  // || peer && peer.readyState === 1
}

/**
 * Send JSON message to WebSocket peer
 */
export const sendWS = (peer, type, payload) => {
  try {
    if (!isPeerReady(peer)) {
      console.warn(`[WS] Cannot send '${type}': peer not ready`)
      return false
    }

    peer.send(JSON.stringify({
      type,
      payload: {
        ...payload,
        timestamp: new Date().toISOString()
      }
    }))

    return true
  } catch (err) {
    console.error(`[WS] Send error for '${type}':`, err.message)
    return false
  }
}

/**
 * Send error message to WebSocket peer
 */
export const sendWSError = (peer, code, message) => {
  return sendWS(peer, 'error', { code, message })
}

/**
 * Send acknowledgement message
 */
export const sendAck = (peer, action, data = {}) => {
  return sendWS(peer, 'ack', { action, ...data })
}

/**
 * Parse WebSocket message
 */
export const parseMessage = (message) => {
  try {
    const text = typeof message === 'string' ? message : message.toString('utf8')
    return JSON.parse(text)
  } catch (err) {
    console.error('[WS] Parse error:', err.message)
    return null
  }
}

export const USER_STATUSES = {
  ONLINE: 'online',
  OFFLINE: 'offline'
}

/**
 * WebSocket connection store
 */
export const wsStore = {
  userConnections: new Map(),
  adminConnections: new Map(),

  // User connection management
  addUser(userId, peer) {
    const id = userId.toString()
    this.userConnections.set(id, peer)
    console.log(`[STORE] User added: ${id} (Total: ${this.userConnections.size})`)
  },

  removeUser(userId) {
    const id = userId.toString()
    const removed = this.userConnections.delete(id)
    if (removed) {
      console.log(`[STORE] User removed: ${id} (Total: ${this.userConnections.size})`)
    }
    return removed
  },

  getUser(userId) {
    return this.userConnections.get(userId.toString())
  },

  getAllUsers() {
    return Array.from(this.userConnections.entries())
  },

  // Admin connection management
  addAdmin(adminId, peer) {
    const id = adminId.toString()
    this.adminConnections.set(id, peer)
    console.log(`[STORE] Admin added: ${id} (Total: ${this.adminConnections.size})`)
  },

  removeAdmin(adminId) {
    const id = adminId.toString()
    const removed = this.adminConnections.delete(id)
    if (removed) {
      console.log(`[STORE] Admin removed: ${id} (Total: ${this.adminConnections.size})`)
    }
    return removed
  },

  getAdmin(adminId) {
    return this.adminConnections.get(adminId.toString())
  },

  getAllAdmins() {
    return Array.from(this.adminConnections.entries())
  },

  // Broadcasting
  broadcastToAdmins(type, payload) {
    let sent = 0
    const total = this.adminConnections.size

    this.adminConnections.forEach((peer, adminId) => {
      if (sendWS(peer, type, payload)) {
        sent++
      } else {
        console.warn(`[BROADCAST] Failed to send '${type}' to admin ${adminId}`)
      }
    })

    console.log(`[BROADCAST] Sent '${type}' to ${sent}/${total} admins`)
    return sent
  },

  broadcastToUser(userId, type, payload) {
    const peer = this.getUser(userId)
    if (!peer) {
      console.warn(`[BROADCAST] User ${userId} not connected`)
      return false
    }

    const sent = sendWS(peer, type, payload)
    console.log(`[BROADCAST] Sent '${type}' to user ${userId}: ${sent ? 'success' : 'failed'}`)
    return sent
  },

  broadcastToAllUsers(type, payload) {
    let sent = 0
    const total = this.userConnections.size

    this.userConnections.forEach((peer, userId) => {
      if (sendWS(peer, type, payload)) {
        sent++
      }
    })

    console.log(`[BROADCAST] Sent '${type}' to ${sent}/${total} users`)
    return sent
  },

  // Cleanup stale connections
  cleanupStaleConnections() {
    let cleaned = 0

    // Clean users
    this.userConnections.forEach((peer, userId) => {
      if (!isPeerReady(peer)) {
        this.removeUser(userId)
        cleaned++
      }
    })

    // Clean admins
    this.adminConnections.forEach((peer, adminId) => {
      if (!isPeerReady(peer)) {
        this.removeAdmin(adminId)
        cleaned++
      }
    })

    if (cleaned > 0) {
      console.log(`[CLEANUP] Removed ${cleaned} stale connections`)
    }

    return cleaned
  },

  // Stats
  getStats() {
    return {
      activeUsers: this.userConnections.size,
      activeAdmins: this.adminConnections.size,
      total: this.userConnections.size + this.adminConnections.size
    }
  },

  // Clear all connections (for testing/shutdown)
  clear() {
    this.userConnections.clear()
    this.adminConnections.clear()
    console.log('[STORE] All connections cleared')
  }
}

// Periodic cleanup of stale connections (every 60 seconds)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    wsStore.cleanupStaleConnections()
  }, 60000)
}