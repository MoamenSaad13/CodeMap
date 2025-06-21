const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const tasksSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Task title is required."],
    },
    description: {
      type: String,
      required: [true, "Task description is required."],
    },
    status: {
      type: String,
      default: "pending",
      enum: {
        values: ["pending", "in-progress", "completed"],
        message: "{VALUE} is not a supported task status.",
      },
    },
    instructions: {
      type: String,
      required: [true, "Task instructions are required."],
    },

    /**
     * Questions embedded directly with their original Mongo _id
     */
    questions: [
      {
        // Use native _id from Question model; don't need questionId
        _id: {
          type: Schema.Types.ObjectId,
          required: true
        },
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
        options: [
          {
            _id: { // use real Mongo _id for option
              type: Schema.Types.ObjectId,
              required: true
            },
            text: {
              type: String,
              required: function () {
                return this.questionType === "multiple_choice";
              }
            }
          }
        ],
        correctAnswers: [{
          type: Schema.Types.ObjectId, // Reference option _id directly
          required: function () {
            return this.questionType === "multiple_choice";
          }
        }],
        points: {
          type: Number,
          default: 1,
          min: [0, "Points cannot be negative."]
        }
      }
    ],

    totalPoints: {
      type: Number,
      default: 0
    },

    grading: {
      type: String,
      enum: {
        values: ["automatic", "manual"],
        message: "{VALUE} is not a supported grading type."
      },
      default: "automatic"
    },

    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category reference is required."],
      index: true,
    },

    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    questionpool: {
      type: Schema.Types.ObjectId,
      ref: "QuestionPool",
    },

    timeLimit: {
      type: Number,
      default: 60,
      min: [1, "Time limit must be at least 1 minute."]
    },

    startedUsers: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User" },
        startedAt: Date,
        completed: { type: Boolean, default: false },
        score: Number
      }
    ],

    requireAllLessonsCompleted: {
      type: Boolean,
      default: true
    },

    taskType: {
      type: String,
      enum: {
        values: ["text", "multiple_choice", "code"],
        message: "{VALUE} is not a supported task type."
      },
      default: "multiple_choice"
    },

    userSessions: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        startedAt: Date,
        completed: Boolean,
        score: Number
      }
    ]
  },
  {
    timestamps: true,
  }
);

// --- Middleware for Cascading Deletes ---

/**
 * @description Mongoose pre-hook for `findOneAndDelete`.
 * Before a Task document is deleted, this hook cleans up references to this task
 * in other collections (User, Category) and deletes related documents (Submission).
 */
tasksSchema.pre(
  "findOneAndDelete",
  { document: false, query: true },
  async function (next) {
    // `this` refers to the query object
    const docToDelete = await this.model.findOne(this.getFilter());

    if (!docToDelete) {
      return next(); // Document not found, nothing to cascade
    }
    
    const taskId = docToDelete._id;
    const userIds = docToDelete.user; // Users who were assigned this task
    const categoryId = docToDelete.category;

    console.log(`Cascading delete initiated for Task ID: ${taskId}`);

    try {
      // Dynamically require models within the hook
      const Category = mongoose.model("Category");
      const User = mongoose.model("User");
      const Submission = mongoose.model("Submission"); // Added Submission model

      // 1. Remove Task reference from assigned Users
      if (userIds && userIds.length > 0) {
        await User.updateMany(
          { _id: { $in: userIds } },
          { $pull: { task: taskId } } // Remove taskId from the 'task' array in User documents
        );
        console.log(
          ` - Removed task ${taskId} reference from ${userIds.length} associated Users.`
        );
      }

      // 2. Remove Task reference from the parent Category
      if (categoryId) {
        // Category.task is now an array, so use $pull
        await Category.updateOne(
          { _id: categoryId },
          { $pull: { task: taskId } } // Remove taskId from the 'task' array in Category document
        );
        console.log(
          ` - Removed task ${taskId} reference from parent Category ${categoryId}.`
        );
      }

      // 3. Delete all Submissions related to this Task
      const submissionResult = await Submission.deleteMany({ task: taskId });
      console.log(
        ` - Deleted ${submissionResult.deletedCount} Submissions for task ${taskId}.`
      );

      next(); // Proceed with the actual task deletion
    } catch (error) {
      console.error(`Error during cascading delete for Task ${taskId}:`, error);
      // Pass the error to Mongoose to halt the operation
      next(error);
    }
  },
  tasksSchema.pre('deleteOne', { document: false, query: true }, async function (next) {
  const taskId = this.getFilter()?._id;

  if (taskId) {
    const Submission = mongoose.model('Submission');
    await Submission.deleteMany({ task: taskId });
  }

    next();
  }));

module.exports = mongoose.model("Tasks", tasksSchema);
