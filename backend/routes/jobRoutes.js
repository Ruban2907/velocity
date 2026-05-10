const express = require("express");
const { createJob, getAllJobs, getJobById, deleteJob } = require("../controllers/jobController");

const router = express.Router();

router.post("/", createJob);
router.get("/", getAllJobs);
router.get("/:id", getJobById);
router.delete("/:id", deleteJob);

module.exports = router;
