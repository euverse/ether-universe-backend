import { Schema } from "mongoose";

export const NOTIFICATION_TYPES = {
    MESSAGE: "message",
    ANNOUNCEMENT: "announcement"
};


const notificationSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    type: {
        type: String,
        enum: Object.values(NOTIFICATION_TYPES),
        default:NOTIFICATION_TYPES.MESSAGE
    },
    priority: {
        type: Number,
        min:0.1,
        max:1,
        required:true
    },
    title: {
        type: String,
        required: true
    },
    textContent: {
        type: String
    },
    banner: {
        type: String
    },
    themeColor: {
        type: String
    },
    readAt: {
        type: Date,
        default: null
    },
    action: {
        label: String,
        to: String
    },
    reminder: {
        isEnabled: {
            type: Boolean,
            default: false
        },
        remindAt: Date
    }
}, { timestamps: true });

export default notificationSchema;