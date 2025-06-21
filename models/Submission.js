const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * @description Schema for Task Submissions with enhanced support for timed tasks and per-question answers.
 * Each document represents a single submission by a user for a specific task.
 */
const submissionSchema = new mongoose.Schema(
  {
    /**
     * @description Reference to the Task being submitted for.
     */
    task: {
      type: Schema.Types.ObjectId,
      ref: "Tasks", // Reference the Tasks model
      required: [true, "Task reference is required."],
      index: true, // Index for faster querying by task
    },
    /**
     * @description Reference to the User who made the submission.
     */
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required."],
      index: true, // Index for faster querying by user
    },
    /**
     * @description When the user started the task.
     */
    startedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    /**
     * @description When the user completed and submitted the task.
     */
    completedAt: {
      type: Date
    },
    /**
     * @description Time spent in seconds.
     */
    timeSpent: {
      type: Number
    },
    /**
     * @description Track answers for each question.
     */
    answers: [{
      questionId: {
        type: String,
        required: true
      },
      selectedOptions: [{
        type: String
      }]
    }],
    /**
     * @description Score information.
     */
    score: {
      type: Number,
      default: 0
    },
    /**
     * @description Total number of questions in the task.
     */
    totalQuestions: {
      type: Number,
      required: true
    },
    /**
     * @description Number of correctly answered questions.
     */
    correctAnswers: {
      type: Number,
      default: 0
    },
    /**
     * @description Percentage score (0-100).
     */
    percentageScore: {
      type: Number,
      default: 0
    },
    /**
     * @description Whether the submission is locked after final submission.
     */
    isLocked: {
      type: Boolean,
      default: false
    },
    /**
     * @description Status of the submission.
     */
    status: {
      type: String,
      default: "in-progress",
      enum: {
        values: ["in-progress", "submitted", "graded", "expired"],
        message: "{VALUE} is not a supported submission status.",
      },
    },
    /**
     * @description Feedback provided by the admin (if manually reviewed).
     */
    feedback: {
      type: String,
      default: null,
    },
    /**
     * @description Date when the submission was graded (if manually reviewed).
     */
    gradedAt: {
      type: Date,
    },
    /**
     * @description Current question index the user is on (for frontend tracking).
     */
    currentQuestionIndex: {
      type: Number,
      default: 0
    }
  },
  {
    /**
     * @description Automatically add `createdAt` and `updatedAt` timestamps.
     */
    timestamps: true,
  }
);

// --- Compound Index ---
// Ensures a user can only have one active submission per task
submissionSchema.index({ task: 1, user: 1, isLocked: 1 }, { 
  unique: true,
  partialFilterExpression: { isLocked: false }
});

module.exports = mongoose.model("Submission", submissionSchema);