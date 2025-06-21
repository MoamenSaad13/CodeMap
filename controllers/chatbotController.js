const User = require("../models/User");
const Roadmap = require("../models/Roadmap");
const ChatSession = require("../models/ChatSession");
const jwt = require("jsonwebtoken");
const axios = require("axios");

// Python chatbot service URL
const CHATBOT_SERVICE_URL = process.env.CHATBOT_SERVICE_URL || "http://127.0.0.1:8001/";
console.log("Node.js CHATBOT_SERVICE_URL:", CHATBOT_SERVICE_URL);

/**
 * @description Extract user ID from JWT token
 */
const getUserFromToken = (req) => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
  if (!token) {
    throw new Error("No authentication token provided");
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    return decoded.UserInfo.id;
  } catch (error) {
    throw new Error("Invalid authentication token");
  }
};

/**
 * @description Create a new chat session
 */
const createChatSession = async (req, res) => {
  try {
    const userId = getUserFromToken(req);

    const chatSession = new ChatSession({
      user: userId,
      title: "New Chat",
      messages: [],
    });

    await chatSession.save();

    // Add session to user's chatSessions array
    await User.findByIdAndUpdate(userId, { $push: { chatSessions: chatSession._id } });

    res.status(201).json({
      success: true,
      message: "Chat session created successfully",
      data: {
        session_id: chatSession._id, // now using default MongoDB ID
        title: chatSession.title,
        created_at: chatSession.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating chat session:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create chat session",
    });
  }
};

/**
 * @description Get all chat sessions for a user
 */
const getUserChatSessions = async (req, res) => {
  try {
    const userId = getUserFromToken(req);

    const chatSessions = await ChatSession.find({ user: userId, is_active: true })
      .select("_id title createdAt updatedAt")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      message: "Chat sessions retrieved successfully",
      data: chatSessions,
    });
  } catch (error) {
    console.error("Error getting chat sessions:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get chat sessions",
    });
  }
};

/**
 * @description Get a specific chat session with messages
 */
const getChatSession = async (req, res) => {
  try {
    const userId = getUserFromToken(req);
    const { sessionId } = req.params;

    const chatSession = await ChatSession.findOne({
      _id: sessionId,
      user: userId,
      is_active: true,
    }).populate("last_suggested_roadmap", "title");

    if (!chatSession) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Chat session retrieved successfully",
      data: chatSession,
    });
  } catch (error) {
    console.error("Error getting chat session:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get chat session",
    });
  }
};

const sendMessage = async (req, res) => {
  try {
    const userId = getUserFromToken(req);
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
    }

    const chatSession = await ChatSession.findOne({
      _id: sessionId,
      user: userId,
      is_active: true,
    });

    if (!chatSession) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    try {
      // Call Python chatbot
      const chatbotResponse = await axios.post(`${CHATBOT_SERVICE_URL}/chat`, {
        session_id: sessionId,
        user_input: message,
      }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });

      let assistantResponse = chatbotResponse.data.assistant_message;

      // 1️⃣ Extract Roadmap ID from chatbot message (expects: `Roadmap ID: `abc123`)
      const roadmapIdMatch = assistantResponse.match(/Roadmap ID.*?`(.+?)`/i);

      if (roadmapIdMatch && roadmapIdMatch[1]) {
        const roadmapId = roadmapIdMatch[1];
        const roadmapDoc = await Roadmap.findById(roadmapId);
        if (roadmapDoc) {
          chatSession.last_suggested_roadmap = roadmapDoc._id;
          chatSession.roadmap_confirmed = false;
        }
      }

      // 2️⃣ Detect confirmation or rejection
      const lowerMsg = message.toLowerCase();
      const confirmKeywords = ["yes", "i'm interested", "sounds good", "sure", "i like it", "confirm"];
      const rejectKeywords = ["no", "not interested", "something else", "another", "reject"];

      const isConfirm = confirmKeywords.some(k => lowerMsg.includes(k));
      const isReject = rejectKeywords.some(k => lowerMsg.includes(k));

      if (isConfirm && chatSession.last_suggested_roadmap) {
        chatSession.roadmap_confirmed = true;
      }

      if (isReject && chatSession.last_suggested_roadmap) {
        // Push to rejected_roadmaps if not already present
        const isAlreadyRejected = chatSession.rejected_roadmaps.some(
          id => id.toString() === chatSession.last_suggested_roadmap.toString()
        );
        if (!isAlreadyRejected) {
          chatSession.rejected_roadmaps.push(chatSession.last_suggested_roadmap);
        }

        // Clear suggestion
        chatSession.last_suggested_roadmap = null;
        chatSession.roadmap_confirmed = false;
      }

      // Save messages
      chatSession.messages.push(
        { role: "user", content: message },
        { role: "assistant", content: assistantResponse }
      );

      if (chatSession.messages.length === 2) {
        chatSession.title = message.substring(0, 50) + (message.length > 50 ? "..." : "");
      }

      await chatSession.save();

      res.status(200).json({
        success: true,
        message: "Message sent successfully",
        data: {
          user_message: message,
          assistant_response: assistantResponse,
        },
      });

    } catch (chatbotError) {
      console.error("Error communicating with chatbot service:", chatbotError);

      const fallbackResponse = "I'm sorry, but I'm having trouble processing your request right now. Please try again in a moment.";

      chatSession.messages.push(
        { role: "user", content: message },
        { role: "assistant", content: fallbackResponse }
      );

      if (chatSession.messages.length === 2) {
        chatSession.title = message.substring(0, 50) + (message.length > 50 ? "..." : "");
      }

      await chatSession.save();

      res.status(200).json({
        success: true,
        message: "Message sent successfully (fallback response)",
        data: {
          user_message: message,
          assistant_response: fallbackResponse,
        },
      });
    }

  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to send message",
    });
  }
};

/**
 * @description Delete a chat session
 */
const deleteChatSession = async (req, res) => {
  try {
    const userId = getUserFromToken(req);
    const { sessionId } = req.params;

    const chatSession = await ChatSession.findOneAndDelete({
      _id: sessionId,
      user: userId,
      is_active: true,
    });

    if (!chatSession) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    await User.findByIdAndUpdate(userId, { $pull: { chatSessions: chatSession._id } });

    res.status(200).json({
      success: true,
      message: "Chat session deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting chat session:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete chat session",
    });
  }
};

module.exports = {
  createChatSession,
  getUserChatSessions,
  getChatSession,
  sendMessage,
  deleteChatSession,
};
