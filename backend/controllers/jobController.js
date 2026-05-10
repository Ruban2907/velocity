const JobSpec = require("../model/JobSpec");
const Candidate = require("../model/Candidate");

const createJob = async (req, res) => {
  try {
    const {
      job_title,
      location,
      seniority,
      industry,
      company_size,
      keywords,
      email_required,
      per_page,
      post_filters,
    } = req.body || {};

    // Map snake_case payload from frontend to camelCase JobSpec model
    const newJob = new JobSpec({
      jobTitle: job_title,
      location: location,
      seniority: seniority,
      industry: industry,
      companySize: company_size,
      keywords: keywords,
      emailRequired: email_required,
      perPage: per_page,
      postFilters: post_filters ? {
        skills: post_filters.skills,
        minExperienceYears: post_filters.min_experience_years,
        education: post_filters.education,
      } : undefined,
    });

    const savedJob = await newJob.save();

    return res.status(201).json({
      success: true,
      data: savedJob,
    });
  } catch (error) {
    console.error("Error creating job spec:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create job specification",
    });
  }
};

const getAllJobs = async (req, res) => {
  try {
    const jobs = await JobSpec.find().sort({ createdAt: -1 });
    
    const jobsWithCounts = await Promise.all(
      jobs.map(async (job) => {
        const candidateCount = await Candidate.countDocuments({ jobId: job._id });
        return {
          ...job.toObject(),
          candidateCount,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: jobsWithCounts,
    });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch jobs",
    });
  }
};

const getJobById = async (req, res) => {
  try {
    const job = await JobSpec.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    const candidateCount = await Candidate.countDocuments({ jobId: job._id });

    return res.status(200).json({
      success: true,
      data: {
        ...job.toObject(),
        candidateCount,
      },
    });
  } catch (error) {
    console.error("Error fetching job by ID:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID format",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to fetch job",
    });
  }
};

const deleteJob = async (req, res) => {
  try {
    const job = await JobSpec.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    // Cascade-delete all candidates linked to this job
    const deletedCandidates = await Candidate.deleteMany({ jobId: job._id });

    // Delete the job spec itself
    await JobSpec.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Job and associated candidates deleted successfully",
      deletedCandidateCount: deletedCandidates.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting job:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID format",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to delete job",
    });
  }
};

module.exports = {
  createJob,
  getAllJobs,
  getJobById,
  deleteJob,
};
