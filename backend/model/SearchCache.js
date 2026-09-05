const mongoose = require("mongoose");

const searchCacheSchema = new mongoose.Schema(
  {
    queryHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    normalizedQuery: {
      type: Object,
      required: true,
    },
    candidates: {
      type: Array,
      default: [],
    },
    source: {
      type: String,
      default: "apify",
    },
    lastApifyRunId: {
      type: String,
    },
    lastDatasetId: {
      type: String,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Add index for automatic expiration if expiresAt is set
searchCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("SearchCache", searchCacheSchema);
