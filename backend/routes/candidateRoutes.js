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

    console.log("GET /api/candidates filters:", { q, jobId, jobIds, contactStatus, page, limit });

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

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const candidates = await Candidate.find(query)
      .populate("jobId", "jobTitle")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Candidate.countDocuments(query);

    console.log("CANDIDATES RETURNED:", candidates.length);

    return res.status(200).json({
      success: true,
      candidates,
      data: candidates, // backwards compatibility
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
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
    // 1. Get all candidates that are not removed and populate job info
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
    console.error("Error fetching job filters:", error);
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
