const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const checkAdminRole = require("../middleware/checkAdminRole"); // Middleware to ensure only admins can access
const authMiddleware = require("../middleware/authMiddleware"); // General authentication middleware

// Apply authentication and admin check to all routes in this file
router.use(authMiddleware);
router.use(checkAdminRole);

// @route GET /admin/stats
// @desc Get statistics for the admin dashboard
// @access Private (Admin)
router.get("/stats", adminController.getDashboardStats);

// Add other admin-specific routes here if needed in the future

module.exports = router;
