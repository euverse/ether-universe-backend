import { Schema } from 'mongoose'

export const MESSAGE_TYPES = {
  SYSTEM: 'system',
  ADMIN: 'admin',
  USER: 'user'
}

export const MESSAGE_STATUSES = {
  SEEN: 'seen',
  DELIVERED: 'delivered'
}

// Schema for individual messages within a conversation
const messageSchema = new Schema({
  type: {
    type: String,
    enum: Object.values(MESSAGE_TYPES),
    required: true
  },
  textContent: {
    type: String,
    required: true
  },
  attachments: [{
    data: {
      type: String,
    },
    mimeType: {
      type: String
    }
  }],
  deliveredAt: {
    type: Date
  },
  seenAt: {
    type: Date
  },
  author: {
    required: function () { return this.type !== MESSAGE_TYPES.SYSTEM },
    type: Schema.Types.ObjectId,
    refPath: "type"
  }
}, { timestamps: true })

const noteSchema = new Schema({
  textContent: {
    type: String,
    trim: true,
    required: true
  }
}, { timestamps: true })


// Schema for a conversation/chat session
const chatSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User',
    unique: true
  },
  messages: [messageSchema],
  notes: [noteSchema]
}, {
  timestamps: true
})

// Indexes
chatSchema.index({ user: 1, createdAt: -1 }) // For querying user's chats by date

// Methods
chatSchema.methods.addMessage = function ({ type, textContent, attachments, authorId }) {
  this.messages.push({ type, textContent, attachments, author: authorId })
  return this.save()
}

messageSchema.methods.updateMessage = function (messageId, { textContent, attachments }) {
  const message = this.messages.find(m => m._id.toString() === messageId)

  if (textContent) {
    message.textContent = textContent
  }
  if (Array.isArray(attachments)) {
    message.attachments = attachments
  }

  return this.save()
}

chatSchema.methods.addNote = function ({ textContent }) {
  this.notes.push({ textContent })
  return this.save()
}



export default chatSchema;