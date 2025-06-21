const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * @description Schema for Question Pools that store questions by category for random selection.
 */
const questionPoolSchema = new mongoose.Schema(
  {
    /**
     * @description Title of the question pool.
     */
    title: {
      type: String,
      required: [true, "Question pool title is required."],
    },
    /**
     * @description Description of the question pool.
     */
    description: {
      type: String,
      required: [true, "Question pool description is required."],
    },
    /**
     * @description Reference to the Category this question pool belongs to.
     */
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category reference is required."],
      index: true,
    },
      tasks: [{
      type: Schema.Types.ObjectId,
      ref: "Tasks",
    }],
    /**
     * @description Difficulty level of questions in this pool.
     */
    difficultyLevel: {
      type: String,
      enum: {
        values: ["beginner", "intermediate", "advanced"],
        message: "{VALUE} is not a supported difficulty level.",
      },
      default: "intermediate",
    },
    /**
     * @description Array of questions in this pool.
     */
    questions: [
      {
        questionText: {
          type: String,
          required: [true, "Question text is required."],
        },
        questionType: {
          type: String,
          required: true,
          enum: {
            values: ["text", "multiple_choice", "code"],
            message: "{VALUE} is not a supported question type."
          },
          default: "multiple_choice"
        },
        // For multiple choice questions
        options: [{
          id: {
            type: String,
            required: function() { 
              return this.questionType === "multiple_choice"; 
            }
          },
          text: {
            type: String,
            required: function() { 
              return this.questionType === "multiple_choice"; 
            }
          }
        }],
        correctAnswers: [{
          type: String, // References option.id
          required: function() { 
            return this.questionType === "multiple_choice"; 
          }
        }],
        allowMultipleAnswers: {
          type: Boolean,
          default: false
        },
        // Points value for this specific question
        points: {
          type: Number,
          default: 1,
          min: [0, "Points cannot be negative."]
        },
        // Tags for categorizing questions
        tags: [{
          type: String
        }]
      }
    ],
    /**
     * @description Whether this question pool is active.
     */
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    /**
     * @description Automatically add `createdAt` and `updatedAt` timestamps.
     */
    timestamps: true,
  }
);

module.exports = mongoose.model("QuestionPool", questionPoolSchema);