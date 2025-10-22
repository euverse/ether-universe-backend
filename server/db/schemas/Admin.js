import { Schema } from "mongoose";

export const ADMIN_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin'
}

const adminSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  fullName: {
    type: String,
    required: true
  },
  avatarUrl: {
    type: String,
    default: null
  },
  permissions: {
    role: {
      type: String,
      enum: Object.values(ADMIN_ROLES),
      default: ADMIN_ROLES.ADMIN
    },
  },
  auth: {
    password: {
      type: String,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastLoggedInAt: {
      type: Date,
      default: null
    },
    refreshToken: {
      type: String,
      default: null
    }
  },
}, {
  timestamps: true
});

export default adminSchema;