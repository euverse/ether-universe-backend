import { MESSAGE_TYPES, MESSAGE_STATUSES } from '~/db/schemas/Chat.js'

export default defineWebSocketHandler({
  async open(peer) {
    try {
      const url = new URL(peer.request.url)
      const token = url.searchParams.get('token')

      // Validate token presence
      if (!token) {
        console.warn('[USER-WS] Connection attempt without token')
        sendWSError(peer, 'AUTH_FAILED', 'Token required')
        peer.close()
        return
      }

      // Verify token
      const accessTokenSecret = useRuntimeConfig().auth?.user?.accessTokenSecret
      if (!accessTokenSecret) {
        console.error('[USER-WS] Access token secret not configured')
        sendWSError(peer, 'SERVER_ERROR', 'Authentication not configured')
        peer.close()
        return
      }

      const decoded = verifyJWT(token, accessTokenSecret)
      const userId = decoded?.user?._id

      if (!userId) {
        console.warn('[USER-WS] Invalid or expired token')
        sendWSError(peer, 'AUTH_FAILED', 'Invalid or expired token')
        peer.close()
        return
      }

      // Store userId and add to connection store
      peer._userId = userId
      wsStore.addUser(userId, peer)

      console.log(`✓ [USER] ${userId} connected`)

      // Send connection confirmation
      sendWS(peer, 'connected', {
        userId,
        message: 'Connected successfully'
      })

      // Notify all admins of user connection
      wsStore.broadcastToAdmins('userStatusUpdated', {
        userId,
        isOnline: true
      })
    } catch (error) {
      console.error('[USER-WS] Open error:', error)
      sendWSError(peer, 'SERVER_ERROR', 'Connection failed')
      peer.close()
    }
  },

  async message(peer, message) {
    const userId = peer._userId

    // Validate authentication
    if (!userId) {
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
          await handleSendMessage(peer, userId, data.payload)
          break

        case 'updateMessageStatus':
          await handleUpdateMessageStatus(peer, userId, data.payload)
          break

        case 'updateTyping':
          await handleUpdateTyping(peer, userId, data.payload)
          break

        case 'ping':
          sendWS(peer, 'pong', { timestamp: Date.now() })
          break

        case 'updateStatus':
          await handleUpdateStatus(peer, userId, data.payload)
          break

        default:
          console.warn(`[USER-WS] Unknown action: ${data.type}`)
          sendWSError(peer, 'UNKNOWN_ACTION', `Unknown action: ${data.type}`)
      }
    } catch (error) {
      console.error(`[USER-WS] Error handling '${data.type}':`, error)
      sendWSError(peer, 'MESSAGE_ERROR', error.message || 'Failed to process message')
    }
  },

  close(peer) {
    const userId = peer._userId

    if (userId) {
      wsStore.removeUser(userId)
      console.log(`✗ [USER] ${userId} disconnected`)

      // Notify all admins of user disconnection
      wsStore.broadcastToAdmins('userStatusUpdated', {
        userId,
        isOnline: false
      })
    } else {
      console.warn('[USER-WS] Connection closed without userId')
    }
  },

  error(peer, err) {
    console.error('WebSocket error:', err);
  }
})


/**
 * Handle sending a message from user
 */
async function handleSendMessage(peer, userId, payload) {
  const { textContent, attachments = [] } = payload || {}

  // Validate input
  if (!textContent?.trim()) {
    sendWSError(peer, 'INVALID_MESSAGE', 'Message content required')
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
    console.log(`[USER] Created new chat for user ${userId}`)
  }

  // Add message
  await chat.addMessage({
    type: MESSAGE_TYPES.USER,
    textContent: textContent.trim(),
    attachments,
    authorId: userId
  })

  const newMessage = chat.messages[chat.messages.length - 1]
  const messageId = newMessage._id.toString()

  // Acknowledge to user
  sendAck(peer, 'sendMessage', {
    messageId,
    status: 'sent'
  })

  // Broadcast to all admins
  const adminsSent = wsStore.broadcastToAdmins('newMessage', {
    userId,
    messageId,
    textContent: newMessage.textContent,
    attachments: newMessage.attachments,
    createdAt: newMessage.createdAt
  })

  console.log(`[USER] Message ${messageId} from ${userId} sent to ${adminsSent} admin(s)`)
}

/**
 * Handle updating message status (e.g., read, delivered)
 */
async function handleUpdateMessageStatus(peer, userId, payload) {
  const { messageId, status } = payload || {}

  // Validate input
  if (!messageId || !status) {
    sendWSError(peer, 'INVALID_REQUEST', 'messageId and status required')
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

  // Acknowledge to user
  sendAck(peer, 'updateMessageStatus', {
    messageId,
    status
  })

  // Notify admins
  wsStore.broadcastToAdmins('messageStatusUpdated', {
    userId,
    messageId,
    status
  })

  console.log(`[USER] Message ${messageId} status updated to ${status}`)
}

/**
 * Handle updateTindicator from user
 */
async function handleUpdateTyping(peer, userId, payload) {
  const { isTyping = false } = payload || {}

  // Broadcast to all admins
  wsStore.broadcastToAdmins('userTyping', {
    userId,
    isTyping
  })

  // Acknowledge
  sendAck(peer, 'updateTyping', { isTyping })
}

/**
 * Handle update user status from user
 */
async function handleUpdateStatus(peer, payload) {
  const { userId, status = USER_STATUSES.OFFLINE } = payload || {}

  if (!userId) {
    sendWSError(peer, 'INVALID_REQUEST', 'userId required')
    return
  }

  // Send user status to admins
  wsStore.broadcastToAdmins('userStatusUpdated', {
    userId,
    status
  })

  // Acknowledge
  sendAck(peer, 'updateStatus', {
    userId,
    status,
  })
}
