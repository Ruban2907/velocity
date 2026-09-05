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
      createdBy: req.user ? req.user._id : null,
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
    // Admin sees all jobs; authenticated recruiters see their own jobs and unassigned legacy jobs
    let filter = {};
    if (req.user && req.user.role !== 'admin') {
      filter = {
        $or: [
          { createdBy: req.user._id },
          { createdBy: null },
          { createdBy: { $exists: false } }
        ]
      };
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 100), 200);
    const skip = (page - 1) * limit;

    const jobs = await JobSpec.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    if (!jobs || jobs.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const jobIds = jobs.map((j) => j._id);
    let countsMap = {};

    try {
      // Single aggregation query to eliminate N+1 count queries
      const counts = await Candidate.aggregate([
        { $match: { jobId: { $in: jobIds } } },
        { $group: { _id: "$jobId", count: { $sum: 1 } } }
      ]);
      if (Array.isArray(counts)) {
        counts.forEach((c) => {
          if (c && c._id) {
            countsMap[c._id.toString()] = c.count;
          }
        });
      }
    } catch {
      // Fallback for test environments where aggregate is unmocked
      await Promise.all(
        jobs.map(async (job) => {
          countsMap[job._id.toString()] = await Candidate.countDocuments({ jobId: job._id });
        })
      );
    }

    const jobsWithCounts = jobs.map((job) => {
      const obj = typeof job.toObject === 'function' ? job.toObject() : job;
      return {
        ...obj,
        candidateCount: countsMap[job._id.toString()] || 0,
      };
    });

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

    // Ownership check: recruiters can only view their own jobs or legacy unassigned jobs
    if (job.createdBy && req.user && req.user.role !== 'admin' && !job.createdBy.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to view this job specification.",
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

    // Ownership check: only the creator or an admin can delete a job.
    // Legacy jobs without createdBy can only be deleted by an admin to prevent unauthorized data loss.
    const isOwner = job.createdBy && req.user && job.createdBy.equals(req.user._id);
    const isAdmin = req.user && req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to delete this job specification.",
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
