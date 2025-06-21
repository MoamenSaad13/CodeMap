const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * @description ChatSession Schema for storing individual chat conversations
 */
const chatSessionSchema = new mongoose.Schema(
  {
    /**
     * @description Reference to the user who owns this chat session
     */
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /**
     * @description Title/name for this chat session
     */
    title: {
      type: String,
      default: "New Chat",
    },
    /**
     * @description Array of messages in this chat session
     */
    messages: [
      {
        role: {
          type: String,
          enum: ["user", "assistant"],
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    /**
     * @description Last suggested roadmap in this session
     */
    last_suggested_roadmap: {
      type: Schema.Types.ObjectId,
      ref: "Roadmap",
      default: null,
    },
    /**
     * @description Whether user confirmed interest in the suggested roadmap
     */
    roadmap_confirmed: {
      type: Boolean,
      default: false,
    },
    /**
     * @description Whether this chat session is active
     */
    is_active: {
      type: Boolean,
      default: true,
    },
    rejected_roadmaps: [
  {
    type: Schema.Types.ObjectId,
    ref: "Roadmap",
  },
],
  },
  {
    timestamps: true,
  }
  
);

// --- Middleware for Cascading Deletes ---

/**
 * @description Mongoose pre-hook for `findOneAndDelete`.
 * Before a ChatSession document is deleted, this hook cleans up any references.
 */
chatSessionSchema.pre(
  "findOneAndDelete",
  { document: false, query: true },
  async function (next) {
    const docToDelete = await this.model.findOne(this.getFilter()).lean();
    if (!docToDelete) {
      console.log("ChatSession pre-delete hook: Document not found, skipping cascade.");
      return next();
    }
    const sessionId = docToDelete._id;

    console.log(`Cascading delete initiated for ChatSession ID: ${sessionId}`);

    try {
      // Currently, ChatSession doesn't have references in other collections
      // But we can add cleanup logic here if needed in the future
      
      console.log(`Cascading delete for ChatSession ${sessionId} completed successfully.`);
      next();

    } catch (error) {
      console.error(
        `Error during cascading delete for ChatSession ${sessionId}:`,
        error
      );
      next(error);
    }
  }
);
module.exports = mongoose.model("ChatSession", chatSessionSchema);