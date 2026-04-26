/**
 * Profile Routes
 * API routes for Chrome profile management
 */

const express = require("express");
const router = express.Router();
const ProfileService = require("../services/profileService");
const asyncHandler = require("../middlewares/asyncHandler");

/**
 * GET /api/profiles hoặc GET /api/profiles/
 * Get list of Chrome profiles
 */
const getProfilesHandler = asyncHandler(async (req, res) => {
  const profiles = await ProfileService.getProfiles();
  res.json(profiles);
});
router.get("/", getProfilesHandler);
router.get("", getProfilesHandler);

module.exports = router;
