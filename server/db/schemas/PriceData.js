import { Schema } from "mongoose";

const priceDataSchema = new Schema({
    pair: {
        type: Schema.Types.ObjectId,
        ref: 'Pair',
        required: true,
        unique: true
    },
    dataSeries: {
        type: [[Number, Number]], // [timestamp_seconds, price]
        default: []
    },
    lastUpdated: {
        type: Number, // Unix timestamp in seconds
        default: () => Math.floor(Date.now() / 1000)
    },
    lastDataTimestamp: {
        type: Number, // Last timestamp in dataSeries
        default: null
    },
    queryCount: {
        type: Number,
        default: 0
    },
    lastQueried: {
        type: Number, // Unix timestamp in seconds
        default: null
    },
    priority: {
        type: Number, // Higher = more frequently accessed
        default: 0,
        index: true
    },
    isInitialized: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Index for efficient queries
priceDataSchema.index({ priority: -1, lastUpdated: 1 });

// Method to update query stats
priceDataSchema.methods.recordQuery = async function () {
    this.queryCount += 1;
    this.lastQueried = Math.floor(Date.now() / 1000);
    // Calculate priority: weight recent queries higher
    const now = Math.floor(Date.now() / 1000);
    const recencyFactor = this.lastQueried ? Math.max(0, 1 - (now - this.lastQueried) / 86400) : 0;
    this.priority = this.queryCount * 0.7 + recencyFactor * 1000;
    await this.save();
};

// Method to add new data points
priceDataSchema.methods.appendDataPoints = function (newPoints) {
    if (!newPoints || newPoints.length === 0) return;

    // Sort new points by timestamp
    newPoints.sort((a, b) => a[0] - b[0]);

    // Remove duplicates and merge with existing data
    const existingTimestamps = new Set(this.dataSeries.map(d => d[0]));
    const uniqueNewPoints = newPoints.filter(point => !existingTimestamps.has(point[0]));

    if (uniqueNewPoints.length > 0) {
        this.dataSeries.push(...uniqueNewPoints);
        this.dataSeries.sort((a, b) => a[0] - b[0]);

        // Update last data timestamp
        this.lastDataTimestamp = this.dataSeries[this.dataSeries.length - 1][0];
    }

    this.lastUpdated = Math.floor(Date.now() / 1000);
};

export default priceDataSchema;