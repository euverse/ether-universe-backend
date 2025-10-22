import { Schema } from 'mongoose';

export const DOCUMENT_TYPES = {
  PASSPORT: 'passport',
  DRIVERS_LICENSE: 'driversLicense',
  NATIONAL_ID: 'nationalId'
};

export const VERIFICATION_STATUSES = {
  NOT_SUBMITTED:'notSubmitted',
  PENDING: 'pending',
  PROCESSING: 'processing',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};


export const DOCUMENT_PROCESSING_STAGES = {
  MANUAL_REVIEW: 'manual_review',
  ADDRESS_VERIFICATION: 'address_review'
}

const documentInfoSchema = {
  firstName: {
    type: String,
    default: null
  },
  lastName: {
    type: String,
    default: null
  },
  dateOfBirth: {
    type: String,
    default: null
  },
  nationality: {
    type: String,
    default: null
  },
  documentNumber: {
    type: String,
    default: null
  },
  documentExpiry: {
    type: String,
    default: null
  },
  address: {
    type: String,
    default: null
  }
}

const KYCSubmissionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    documentType: {
      type: String,
      enum: Object.values(DOCUMENT_TYPES),
      required: true
    },
    status: {
      type: String,
      enum: Object.values(VERIFICATION_STATUSES),
      default: VERIFICATION_STATUSES.PENDING
    },
    ocrData: documentInfoSchema,
    verifiedData: documentInfoSchema,
    processingStage: {
      type: String
    },
    estimatedCompletion: {
      type: Date,
      default: new Date(Date.now() + 24 * 60 * 60 * 1000)
    },
    approvedAt: {
      type: Date,
      default: null
    },
    rejectedAt: {
      type: Date,
      default: null
    },
    rejectionReason: {
      type: String,
      default: null
    },
    rejectionDetails: {
      type: [String],
      default: []
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin'
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    attachments: {
      documentFrontUrl: {
        type: String,
        required: true
      },
      documentBackUrl: {
        type: String,
        default: null
      }
    },
    metadata: {
      ocrConfidence: {
        type: Number,
        min: 0,
        max: 1,
        default: null
      }
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

KYCSubmissionSchema.virtual('kycSubmissionId').get(function () {
  return `kyc_sub_${this._id}`;
});

export default KYCSubmissionSchema;