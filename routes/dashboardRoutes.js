const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const authenticateUser = require("../middleware/authMiddleware");
const checkAdminRole = require("../middleware/checkAdminRole");

// Apply authentication middleware to all dashboard routes
router.use(authenticateUser);

// --- Route for User Dashboard ---
// Get dashboard data for the authenticated user
router.get("/user", dashboardController.getUserDashboardData);

// --- Route for Admin Dashboard ---
// Get dashboard data for admin users
router.get("/admin", checkAdminRole, dashboardController.getAdminDashboardData);

module.exports = router;