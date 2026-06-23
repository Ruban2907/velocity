const mongoose = require("mongoose");

const candidateSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "JobSpec",
    required: true,
  },
  name: { type: String },
  title: { type: String },
  seniority: { type: String },
  email: { type: String },
  emailStatus: { type: String },
  phone: { type: String },
  linkedinUrl: { type: String },
  location: { type: String },
  companyName: { type: String },
  companyDomain: { type: String },
  companyIndustry: { type: String },
  companySize: { type: String },
  contactStatus: {
    type: String,
    enum: ["not_contacted", "contacted"],
    default: "not_contacted",
  },
  contactedAt: { type: Date },
  isRemoved: {
    type: Boolean,
    default: false,
  },
  removedAt: { type: Date },
  matchScore: { type: Number, default: 0 },
  matchLabel: { type: String, default: "Low match" },
  rankingReasons: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

const Candidate = mongoose.model("Candidate", candidateSchema);
module.exports = Candidate;
