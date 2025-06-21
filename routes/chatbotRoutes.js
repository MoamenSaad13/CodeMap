const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  createChatSession,
  getUserChatSessions,
  getChatSession,
  sendMessage,
  deleteChatSession,
} = require("../controllers/chatbotController");

// All chatbot routes require authentication
router.use(authMiddleware);

/**
 * @route   POST /chatbot/sessions
 * @desc    Create a new chat session
 * @access  Private
 */
router.post("/sessions", createChatSession);

/**
 * @route   GET /chatbot/sessions
 * @desc    Get all chat sessions for the authenticated user
 * @access  Private
 */
router.get("/sessions", getUserChatSessions);

/**
 * @route   GET /chatbot/sessions/:sessionId
 * @desc    Get a specific chat session with messages
 * @access  Private
 */
router.get("/sessions/:sessionId", getChatSession);

/**
 * @route   POST /chatbot/sessions/:sessionId/messages
 * @desc    Send a message in a chat session
 * @access  Private
 */
router.post("/sessions/:sessionId/messages", sendMessage);

/**
 * @route   DELETE /chatbot/sessions/:sessionId
 * @desc    Delete a chat session
 * @access  Private
 */
router.delete("/sessions/:sessionId", deleteChatSession);

module.exports = router;

