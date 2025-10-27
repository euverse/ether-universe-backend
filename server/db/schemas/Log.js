import { Schema } from "mongoose";

export const LOG_TYPES = {
    INFO: "INFO",
    WARNING: "WARNING",
    ERROR: "ERROR",
    SUCCESS: "SUCCESS",
    ROUTINE: "ROUTINE"
}

const logSchema = new Schema({
    taskId: {
        type: String,
        required: true
    },
    type: {
        type: String,
        default: LOG_TYPES.INFO
    },
    message: {
        type: String
    },
    metadata: {
        type: Map,
        of: Schema.Types.Mixed,
        default: new Map()
    }
}, { timestamps: true })

export default logSchema;