const express = require("express");
const { createJob, getAllJobs, getJobById, deleteJob } = require("../controllers/jobController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// All job management endpoints require authentication
router.use(authenticate);

router.post("/", createJob);
router.get("/", getAllJobs);
router.get("/:id", getJobById);
router.delete("/:id", deleteJob);

module.exports = router;

