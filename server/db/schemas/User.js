import { model, Schema } from 'mongoose';
import { ACCOUNT_TYPES } from './TradingAccount.js';

export const USER_AUTH_STATUSES = {
    ACTIVE: 'active',
    FROZEN: 'frozen',
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
        leverage: {
            type: Number,
            default: 300
        },
        currentAccount: {
            type: Schema.Types.ObjectId,
            ref: 'TradingAccount'
        },
        riskManagement: {
            type: String,
            enum: Object.values(USER_TRADING_RISK),
            default: USER_TRADING_RISK.LOW
        },
        maxLeverage: {
            type: Number,
            default: 100
        },
        autoCloseTrades: {
            type: Boolean,
            default: false
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
    status: {
        type: String,
        enum: ['active', 'freezed', 'suspended', 'banned'],
        default: 'active'
    },
    customAttributes: {
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