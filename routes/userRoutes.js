const express = require("express");
const router = express.Router();
const usersController = require("../controllers/usersController");
const authMiddleware = require("../middleware/authMiddleware"); // Renamed import for clarity
const checkAdminRole = require("../middleware/checkAdminRole");

// --- Apply authentication middleware to all user routes ---
// All routes defined below require a valid JWT token.
router.use(authMiddleware);

// --- Routes for Authenticated Users (Self-Actions) ---

// Profile Management
router.put("/update-profile", usersController.updateUserProfile); // Update own profile (name, email - triggers verification)
router.put("/update-password", usersController.updatePassword); // Update own password
router.post("/verify-email", usersController.verifyEmailCode); // Verify pending email change
router.get('/profile-image', usersController.getProfileImageFile); // get profile image for user
router.delete('/delete-profile-image', usersController.deleteProfileImage); // delete profile image

// Account Deletion
router.post("/request-delete", usersController.requestAccountDeletion); // Request deletion code
router.delete("/delete-account", usersController.deleteAccount); // Confirm account deletion with code

// Progress & Enrollment
router.get("/progress", usersController.getUserProgressDetails); // Get own progress details
router.post("/enroll/:roadmapId", usersController.enrollUserInRoadmap); // Enroll self in a roadmap
router.post("/unenroll/:roadmapId", usersController.unenrollUserFromRoadmap); // Unenroll self from a roadmap


router.get('/yearly-registration-counts', usersController.getUserRegistrationsByMonth); //Get user registrations by month (Admin only)
router.get("/getallusers", usersController.getAllUsers); // Get all users (Admin only)
router.get("/:id", usersController.getUserById); // Get a specific user by ID (Admin only)

// Apply admin check middleware for all subsequent routes in this section
router.use(checkAdminRole);

// User Management (Admin)
router.post("/adduser", usersController.addUser); // Add a new user (Admin only)
router.put('/update-profile/:id',  usersController.updateUserProfile);  // Update a user profile (Admin only)
router.delete('/delete-account/:id', usersController.deleteAccount); // Delete a user account (Admin only)
router.get('/progress/:userId',usersController.getUserProgressDetails); // Get progress details of a specific user (Admin only)
router.put("/set-role/:id", usersController.setUserRole); // Set user role (Admin only)
router.get('/profile-image/:id', usersController.getProfileImageFile); // get profile image by id (Admin only)
// Note: enrollUserInRoadmap controller handles admin enrolling others if userId is in body
router.post('/admin/enroll/:userId/:roadmapId',usersController.enrollUserInRoadmap);
// Admin unenrolling a specific user from a roadmap
router.post("/admin/unenroll/:userId/:roadmapId", usersController.unenrollUserFromRoadmap);

// Admin Progress View (Example - if needed)
// router.get("/progress/:userId", usersController.getUserProgressDetails); // Potentially modify controller to handle this

// Note: Removed PUT /set-role/:id route as the setUserRole controller function was not found/exported.

module.exports = router;