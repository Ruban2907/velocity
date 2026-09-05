const mongoose = require("mongoose");

const jobSpecSchema = new mongoose.Schema({
  jobTitle: [String],
  location: [String],
  seniority: [String],
  industry: [String],
  companySize: [String],
  keywords: String,
  emailRequired: Boolean,
  perPage: Number,
  postFilters: {
    skills: [String],
    minExperienceYears: Number,
    education: String,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    default: null,
    index: true,
  },
  createdAt: { type: Date, default: Date.now },
});


const JobSpec = mongoose.model("JobSpec", jobSpecSchema);
module.exports = JobSpec;
