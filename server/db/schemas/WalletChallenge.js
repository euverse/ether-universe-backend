import { Schema } from "mongoose";

const walletChallengeSchema = new Schema({
    challengeId: {
        type: String
    },
    walletAddress: {
        type: String,
        required: true,
    },
    message: {
        type: String,
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 5 * 60 * 1000),
    },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

walletChallengeSchema.pre("save", function (next) {
    if (!this.message) {
        this.message = `Sign this message to authenticate:\n\nWallet: ${this.walletAddress}.\n\nTimestamp: ${this.createdAt.toISOString()}`;
    }
    if (!this.challengeId) {
        this.challengeId = `chall_${this.createdAt.getTime()}`;
    }
    next();
});

walletChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default walletChallengeSchema;
