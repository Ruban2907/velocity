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
    enum: ["Not Contacted", "Contacted"],
    default: "Not Contacted",
  },
  createdAt: { type: Date, default: Date.now },
});

const Candidate = mongoose.model("Candidate", candidateSchema);
module.exports = Candidate;
