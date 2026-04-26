/**
 * Job Routes
 * API routes for job management
 */

const express = require("express");
const router = express.Router();
const JobController = require("../controllers/jobController");
const { validateJob, validateJobId } = require("../middlewares/validation");
const asyncHandler = require("../middlewares/asyncHandler");

// Get all jobs (optimized with batch query)
router.get("/", asyncHandler(JobController.getAllJobs));

// Get job by ID
router.get("/:id", validateJobId, asyncHandler(JobController.getJobById));

// Create new job
router.post("/", validateJob, asyncHandler(JobController.createJob));

// Update job
router.put("/:id", validateJobId, asyncHandler(JobController.updateJob));

// Delete job
router.delete("/:id", validateJobId, asyncHandler(JobController.deleteJob));

// Run job
const RunController = require("../controllers/runController");
router.post("/:id/run", validateJobId, asyncHandler(RunController.runJob));

module.exports = router;
