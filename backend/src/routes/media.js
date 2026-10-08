const express = require("express");
const mediaController = require("../controllers/mediaController");

const router = express.Router();

// Public — no auth. Backs the gallery section on the Landing Page.
router.get("/landing", mediaController.listLandingMedia);

module.exports = router;
