import { Schema } from 'mongoose';

export const USER_AUTH_STATUSES = {
    ACTIVE: 'active',
    FREEZED: 'freezed',
    SUSPENDED: 'suspended'
}

export const USER_TRADING_RISK = {
    HIGH: 'high',
    LOW: 'low'
}

const userSchema = new Schema({
    id: {
        type: String,
        required: true
    },
    walletAddress: {
        type: String,
        required: true
    },
    email: {
        type: String
    },
    auth: {
        lastLoggedInAt: {
            type: Date,
        },
        refreshToken: {
            type: String
        },
        google2fa: {
            type: Boolean,
            default: false
        },
        status: {
            type: String,
            enum: Object.values(USER_AUTH_STATUSES),
            default: USER_AUTH_STATUSES.ACTIVE
        },
    },
    settings: {
        language: {
            type: String,
            default: 'en'
        },
        theme: {
            type: String,
            default: 'light'
        },
        notifications: {
            type: Boolean,
            default: true
        },
        smsAlerts: {
            type: Boolean,
            default: false
        },
        emailAlerts: {
            type: Boolean,
            default: false
        }
    },
    trading: {
        riskManagement: {
            type: String,
            enum: Object.values(USER_TRADING_RISK),
            default: USER_TRADING_RISK.LOW
        },
        biasedPositive:{
            type:Boolean,
            default:false
        },
        autoCloseTrades: {
            type: Boolean,
            default: true
        }
    },
    security: {
        requirePin: {
            type: Boolean,
            default: false
        },
        privacyMode: {
            type: Boolean,
            default: false
        }
    },
    personalInfo: {
        firstName: {
            type: String
        },
        lastName: {
            type: String
        },
        dateOfBirth: {
            type: Date
        },
        nationality: {
            type: String
        }
    },
    activity: {
        lastLogin: {
            type: Date
        },
        lastDeposit: {
            amount: {
                type: String
            },
            currency: {
                type: String
            },
            timestamp: {
                type: Date
            }
        },
        lastWithdrawal: {
            amount: {
                type: String
            },
            currency: {
                type: String
            },
            timestamp: {
                type: Date
            }
        }
    },
    attrs: {
        type: Schema.Types.Mixed,
        default: {}
    },
    permissions: {
        canTrade: {
            type: Boolean,
            default: false
        },
        kycRequired: {
            type: Boolean,
            default: true
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

export default userSchema;