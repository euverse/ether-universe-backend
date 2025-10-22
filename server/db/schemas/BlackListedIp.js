import { Schema } from "mongoose";


const blackListedIp = new Schema({
    ip: {
        type: String,
        required: true,
        unique: true
    }
}, { timestamps: true })


export default blackListedIp;