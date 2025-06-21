const express = require("express");
const router = express.Router();
const { createMessage, getAllMessages } = require("../controllers/contactController");
const authenticateUser = require("../middleware/authMiddleware");
const checkAdminRole = require("../middleware/checkAdminRole");

// Route to accept contact-us messages (Public)
router.post("/contact-us", createMessage);

// Route to get all contact messages (Admin only)
router.get("/contact-us/messages", authenticateUser, checkAdminRole, getAllMessages);

module.exports = router;