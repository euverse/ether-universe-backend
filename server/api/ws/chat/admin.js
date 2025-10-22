import { MESSAGE_TYPES, MESSAGE_STATUSES } from '~/db/schemas/Chat.js'

export default defineWebSocketHandler({
  async open(peer) {
    try {
      const url = new URL(peer.request.url)
      const token = url.searchParams.get('token')

      // Validate token presence
      if (!token) {
        console.warn('[ADMIN-WS] Connection attempt without token')
        sendWSError(peer, 'AUTH_FAILED', 'Token required')
        peer.close()
        return
      }

      // Verify token
      const accessTokenSecret = useRuntimeConfig().auth?.admin?.accessTokenSecret
      if (!accessTokenSecret) {
        console.error('[ADMIN-WS] Access token secret not configured')
        sendWSError(peer, 'SERVER_ERROR', 'Authentication not configured')
        peer.close()
        return
      }

      const decoded = verifyJWT(token, accessTokenSecret)
      const adminId = decoded?.admin?._id

      if (!adminId) {
        console.warn('[ADMIN-WS] Invalid or expired token')
        sendWSError(peer, 'AUTH_FAILED', 'Invalid or expired admin token')
        peer.close()
        return
      }

      // Store adminId and add to connection store
      peer._adminId = adminId
      wsStore.addAdmin(adminId, peer)

      console.log(`✓ [ADMIN] ${adminId} connected`)

      // Send connection confirmation
      sendWS(peer, 'connected', {
        adminId,
        message: 'Connected as admin'
      })

      // Send current stats
      const stats = wsStore.getStats()
      sendWS(peer, 'stats', stats)
    } catch (error) {
      console.error('[ADMIN-WS] Open error:', error)
      sendWSError(peer, 'SERVER_ERROR', 'Connection failed')
      peer.close()
    }
  },

  async message(peer, message) {
    const adminId = peer._adminId

    // Validate authentication
    if (!adminId) {
      sendWSError(peer, 'AUTH_ERROR', 'Connection not authenticated')
      return
    }

    // Parse message
    const data = parseMessage(message)
    if (!data || !data.type) {
      sendWSError(peer, 'INVALID_MESSAGE', 'Invalid message format')
      return
    }

    try {
      switch (data.type) {
        case 'sendMessage':
          await handleSendMessage(peer, adminId, data.payload)
          break

        case 'updateMessage':
          await handleUpdateMessage(peer, adminId, data.payload)
          break

        case 'updateMessageStatus':
          await handleUpdateMessageStatus(peer, adminId, data.payload)
          break

        case 'updateTyping':
          await handleUpdateTyping(peer, data.payload)
          break

        case 'updateStatus':
          await handleUpdateStatus(peer, data.payload)
          break

        case 'getStats':
          await handleGetStats(peer)
          break

        case 'ping':
          sendWS(peer, 'pong', { timestamp: Date.now() })
          break

        default:
          console.warn(`[ADMIN-WS] Unknown action: ${data.type}`)
          sendWSError(peer, 'UNKNOWN_ACTION', `Unknown action: ${data.type}`)
      }
    } catch (error) {
      console.error(`[ADMIN-WS] Error handling '${data.type}':`, error)
      sendWSError(peer, 'MESSAGE_ERROR', error.message || 'Failed to process message')
    }
  },

  close(peer) {
    const adminId = peer._adminId

    if (adminId) {
      wsStore.removeAdmin(adminId)
      console.log(`✗ [ADMIN] ${adminId} disconnected`)
    } else {
      console.warn('[ADMIN-WS] Connection closed without adminId')
    }
  },

  error(peer, err) {
    console.error('WebSocket error:', err);
  },
})

/**
 * Handle sending a message from admin to user
 */
async function handleSendMessage(peer, adminId, payload) {
  const { userId, textContent, attachments = [] } = payload || {}

  // Validate input
  if (!userId) {
    sendWSError(peer, 'INVALID_REQUEST', 'userId required')
    return
  }

  if (!textContent?.trim()) {
    sendWSError(peer, 'INVALID_REQUEST', 'textContent required')
    return
  }

  const Chat = getModel('Chat')

  // Find or create chat
  let chat = await Chat.findOne({ user: userId })
  if (!chat) {
    chat = await Chat.create({
      user: userId,
      messages: [],
      notes: []
    })
    console.log(`[ADMIN] Created new chat for user ${userId}`)
  }

  // Add message
  await chat.addMessage({
    type: MESSAGE_TYPES.ADMIN,
    textContent: textContent.trim(),
    attachments,
    authorId: adminId
  })

  const newMessage = chat.messages[chat.messages.length - 1]
  const messageId = newMessage._id.toString()

  // Acknowledge to admin
  sendAck(peer, 'sendMessage', {
    userId,
    messageId,
    status: 'sent'
  })

  // Send to user if online
  const delivered = wsStore.broadcastToUser(userId, 'newMessage', {
    messageId,
    textContent: newMessage.textContent,
    attachments: newMessage.attachments,
    type: MESSAGE_TYPES.ADMIN,
    createdAt: newMessage.createdAt
  })

  console.log(`[ADMIN] Message ${messageId} to ${userId} - ${delivered ? 'delivered' : 'user offline'}`)
}

/**
 * Handle updating an existing message (edit)
 */
async function handleUpdateMessage(peer, adminId, payload) {
  const { userId, messageId, textContent, attachments } = payload || {}

  // Validate input
  if (!userId || !messageId) {
    sendWSError(peer, 'INVALID_REQUEST', 'userId and messageId required')
    return
  }

  if (!textContent && !attachments) {
    sendWSError(peer, 'INVALID_REQUEST', 'textContent or attachments required for update')
    return
  }

  const Chat = getModel('Chat')
  const chat = await Chat.findOne({ user: userId })

  if (!chat) {
    sendWSError(peer, 'CHAT_NOT_FOUND', 'Chat not found')
    return
  }

  const message = chat.messages.id(messageId)
  if (!message) {
    sendWSError(peer, 'MESSAGE_NOT_FOUND', 'Message not found')
    return
  }

  // Update message fields
  if (textContent !== undefined) {
    message.textContent = textContent.trim()
  }
  if (attachments !== undefined) {
    message.attachments = attachments
  }

  await chat.save()

  // Acknowledge to admin
  sendAck(peer, 'updateMessage', {
    userId,
    messageId
  })

  // Notify user of update
  wsStore.broadcastToUser(userId, 'messageUpdated', {
    _id: messageId,
    textContent: message.textContent,
    attachments: message.attachments,
    updatedAt: message.updatedAt || new Date()
  })

  console.log(`[ADMIN] Message ${messageId} updated by ${adminId}`)
}

/**
 * Handle updating message status
 */
async function handleUpdateMessageStatus(peer, adminId, payload) {
  const { userId, messageId, status } = payload || {}

  // Validate input
  if (!userId || !messageId || !status) {
    sendWSError(peer, 'INVALID_REQUEST', 'userId, messageId and status required')
    return
  }

  if (!Object.values(MESSAGE_STATUSES).includes(status)) {
    sendWSError(peer, 'INVALID_STATUS', `Invalid status. Must be one of: ${Object.values(MESSAGE_STATUSES).join(', ')}`)
    return
  }

  const Chat = getModel('Chat')
  const chat = await Chat.findOne({ user: userId })

  if (!chat) {
    sendWSError(peer, 'CHAT_NOT_FOUND', 'Chat not found')
    return
  }

  const message = chat.messages.id(messageId)
  if (!message) {
    sendWSError(peer, 'MESSAGE_NOT_FOUND', 'Message not found')
    return
  }

  // Update status
  message.status = status
  await chat.save()

  // Acknowledge to admin
  sendAck(peer, 'updateMessageStatus', {
    userId,
    messageId,
    status
  })

  // Notify user
  wsStore.broadcastToUser(userId, 'messageStatusUpdated', {
    messageId,
    status
  })

  console.log(`[ADMIN] Message ${messageId} status updated to ${status} by ${adminId}`)
}

/**
 * Handle typing indicator from admin
 */
async function handleUpdateTyping(peer, payload) {
  const { userId, isTyping = false } = payload || {}

  if (!userId) {
    sendWSError(peer, 'INVALID_REQUEST', 'userId required')
    return
  }

  // Send typing indicator to user
  const sent = wsStore.broadcastToUser(userId, 'adminTyping', {
    isTyping
  })


  // Acknowledge
  sendAck(peer, 'updateTyping', {
    userId,
    isTyping,
    delivered: sent
  })
}

/**
 * Handle update admin status from admin
 */
async function handleUpdateStatus(peer, payload) {

  const { status = USER_STATUSES.OFFLINE } = payload || {}

  // Send online status to users
  const sent = wsStore.broadcastToAllUsers('adminStatusUpdated', {
    status
  })

  // Acknowledge
  sendAck(peer, 'updateStatus', {
    userId,
    status,
    delivered: sent
  })
}


/**
 * Handle stats request
 */
async function handleGetStats(peer) {
  const stats = wsStore.getStats()
  sendWS(peer, 'stats', stats)
}