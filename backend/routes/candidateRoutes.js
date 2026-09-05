const express = require("express");
const Candidate = require("../model/Candidate");
const JobSpec = require("../model/JobSpec");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// GET /api/candidates
// Fetch all candidates with filtering and search
router.get("/", authenticate, async (req, res) => {
  try {
    const { q, jobId, jobIds, contactStatus, page = 1, limit = 20 } = req.query;

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);

    const query = { isRemoved: { $ne: true } };

    if (jobId) {
      query.jobId = jobId;
    } else if (jobIds) {
      const ids = jobIds.split(",").filter(Boolean);
      if (ids.length) {
        query.jobId = { $in: ids };
      }
    }

    if (contactStatus) {
      query.contactStatus = contactStatus;
    }

    if (q) {
      const searchRegex = new RegExp(q, "i");
      query.$or = [
        { name: searchRegex },
        { title: searchRegex },
        { companyName: searchRegex },
        { email: searchRegex },
      ];
    }

    const skip = (safePage - 1) * safeLimit;
    
    const candidates = await Candidate.find(query)
      .populate("jobId", "jobTitle")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit);

    const total = await Candidate.countDocuments(query);

    return res.status(200).json({
      success: true,
      candidates,
      data: candidates, // backwards compatibility
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
      },
    });
  } catch (error) {
    console.error("Error fetching candidates:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch candidates",
    });
  }
});

// GET /api/candidates/job-filters
// Return job specs that have non-removed candidates, grouped by normalized title
router.get("/job-filters", authenticate, async (req, res) => {
  try {
    let jobCounts = null;
    try {
      jobCounts = await Candidate.aggregate([
        { $match: { isRemoved: { $ne: true }, jobId: { $ne: null } } },
        { $group: { _id: "$jobId", count: { $sum: 1 } } }
      ]);
    } catch {
      jobCounts = null;
    }

    if (Array.isArray(jobCounts)) {
      const jobIds = jobCounts.map(jc => jc._id);
      const jobs = await JobSpec.find({ _id: { $in: jobIds } }).select("jobTitle");
      const jobMap = new Map();
      jobs.forEach(j => jobMap.set(j._id.toString(), j));

      const groupedFilters = new Map();
      const normalize = (t) => t.trim().toLowerCase().replace(/\s+/g, " ");
      const toTitleCase = (t) => t.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

      for (const jc of jobCounts) {
        const job = jobMap.get(jc._id.toString());
        if (!job) continue;
        const rawTitle = Array.isArray(job.jobTitle) ? job.jobTitle[0] : job.jobTitle;
        if (!rawTitle) continue;

        const key = normalize(rawTitle);
        if (!groupedFilters.has(key)) {
          groupedFilters.set(key, {
            key,
            title: toTitleCase(key),
            candidateCount: 0,
            jobIds: new Set()
          });
        }
        const group = groupedFilters.get(key);
        group.candidateCount += jc.count;
        group.jobIds.add(jc._id.toString());
      }

      const filters = Array.from(groupedFilters.values()).map(f => ({
        ...f,
        jobIds: Array.from(f.jobIds)
      })).sort((a, b) => b.candidateCount - a.candidateCount);

      return res.status(200).json({
        success: true,
        filters,
      });
    }

    // Fallback: in-memory grouping for environments where aggregate is unavailable
    const candidates = await Candidate.find({ isRemoved: { $ne: true } })
      .populate("jobId", "jobTitle")
      .select("jobId");

    const groupedFilters = new Map();
    const normalize = (t) => t.trim().toLowerCase().replace(/\s+/g, " ");
    const toTitleCase = (t) => t.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    for (const cand of candidates) {
      if (!cand.jobId) continue;
      
      const rawTitle = Array.isArray(cand.jobId.jobTitle) ? cand.jobId.jobTitle[0] : cand.jobId.jobTitle;
      if (!rawTitle) continue;

      const key = normalize(rawTitle);
      
      if (!groupedFilters.has(key)) {
        groupedFilters.set(key, {
          key,
          title: toTitleCase(key),
          candidateCount: 0,
          jobIds: new Set()
        });
      }

      const group = groupedFilters.get(key);
      group.candidateCount += 1;
      group.jobIds.add(cand.jobId._id.toString());
    }

    const filters = Array.from(groupedFilters.values()).map(f => ({
      ...f,
      jobIds: Array.from(f.jobIds)
    })).sort((a, b) => b.candidateCount - a.candidateCount);

    return res.status(200).json({
      success: true,
      filters,
    });
  } catch (error) {
    console.error("Error fetching job filters:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch job filters",
    });
  }
});


// PATCH /api/candidates/:id/contacted
router.patch("/:id/contacted", authenticate, async (req, res) => {
  try {
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      { 
        contactStatus: "contacted",
        contactedAt: new Date()
      },
      { new: true }
    );

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Candidate marked as contacted.",
      candidate,
    });
  } catch (error) {
    console.error("Error updating candidate:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update candidate",
    });
  }
});

// DELETE /api/candidates/:id
// Soft delete
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      {
        isRemoved: true,
        removedAt: new Date(),
      },
      { new: true }
    );

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Candidate removed.",
    });
  } catch (error) {
    console.error("Error deleting candidate:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete candidate",
    });
  }
});

module.exports = router;
