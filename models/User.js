const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * @description User Schema for the educational platform.
 */
const userSchema = new mongoose.Schema(
  {
    /**
     * @description User's first name.
     */
    first_name: {
      type: String,
      required: [true, "First name is required."],
    },
    /**
     * @description User's last name.
     */
    last_name: {
      type: String,
      required: [true, "Last name is required."],
    },
    /**
     * @description User's email address. Must be unique.
     */
    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      lowercase: true, // Store emails in lowercase for consistency
      trim: true, // Remove leading/trailing whitespace
      match: [/.+\@.+\..+/, "Please fill a valid email address"], // Basic email format validation
    },
    /**
     * @description User's hashed password. Optional for OAuth users.
     */
    password: {
      type: String,
      // Removed required: true - Not required for Google OAuth users
    },
    /**
     * @description User's role within the platform.
     */
    role: {
      type: String,
      required: true,
      default: "user",
      enum: {
        // Restrict roles to specific values
        values: ["user", "admin"],
        message: "{VALUE} is not a supported role.",
      },
    },
    /**
     * @description Path to the user's profile image file.
     */
    profile_image: {
      type: String,
      default: null,
    },

    googleProfilePicture: {
      type: String,
      default: null,
    },
    /**
     * @description Unique identifier from Google OAuth.
     */
    googleId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values, but unique if value exists
      index: true,
    },
    /**
     * @description Token used for password reset requests.
     */
    resetPasswordToken: {
      type: String,
    },
    /**
     * @description Expiry date for the password reset token.
     */
    resetPasswordExpires: {
      type: Date,
    },
    /**
     * @description Code sent to user for verifying a new email address.
     */
    verificationCode: {
      type: String,
    },
    /**
     * @description Temporarily stores a new email address pending verification.
     */
    pendingEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    /**
     * @description Array of ObjectIds referencing Roadmaps the user is enrolled in.
     */
    roadmap: [
      {
        type: Schema.Types.ObjectId,
        ref: "Roadmap",
      },
    ],
    /**
     * @description Array of ObjectIds referencing Tasks assigned to the user.
     */
    task: [
      {
        type: Schema.Types.ObjectId,
        ref: "Tasks", // Refers to the Tasks model
      },
    ],
    /**
     * @description Array of ObjectIds referencing Lessons the user is associated with (potentially redundant if managed via Roadmap).
     */
    lesson: [
      {
        type: Schema.Types.ObjectId,
        ref: "Lesson",
      },
    ],
    /**
     * @description Code sent to user for confirming account deletion.
     */
    deletionCode: {
      type: String,
    },
    /**
     * @description Array of ObjectIds referencing Stages the user is associated with (potentially redundant if managed via Roadmap).
     */
    stage: [
      {
        type: Schema.Types.ObjectId,
        ref: "Stage",
      },
    ],
    /**
     * @description Array of ObjectIds referencing Lessons the user has marked as completed.
     */
    completedlesson: [
      {
        type: Schema.Types.ObjectId,
        ref: "Lesson",
      },
    ],
    /**
     * @description Array of ObjectIds referencing Categories the user is associated with (e.g., enrolled via roadmap, assigned tasks).
     */
    category: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    chatSessions: [
      {
        type: Schema.Types.ObjectId,
        ref: "ChatSession",
      },
    ],    
  },
  {
    /**
     * @description Automatically add `createdAt` and `updatedAt` timestamps.
     */
    timestamps: true,
  }
);

// --- Middleware for Cascading Deletes ---

/**
 * @description Mongoose pre-hook for `findOneAndDelete`.
 * Before a User document is deleted, this hook cleans up references to this user
 * in other collections (Roadmap, Task, Lesson, Stage, Category) and deletes
 * dependent documents (Notification, Chatbot, Submission).
 */
userSchema.pre(
  "findOneAndDelete",
  { document: false, query: true },
  async function (next) {
    // `this` refers to the query object
    // We need to execute the query to find the document being deleted to get its ID
    const docToDelete = await this.model.findOne(this.getFilter());

    // If no document matches the query, proceed without cascading
    if (!docToDelete) {
      return next();
    }

    const userId = docToDelete._id;
    console.log(`Cascading delete initiated for User ID: ${userId}`);

    try {
      // Dynamically require models within the hook to avoid potential circular dependency issues at schema definition time
      const Roadmap = mongoose.model("Roadmap");
      const Task = mongoose.model("Tasks"); // Ensure correct model name
      const Lesson = mongoose.model("Lesson");
      const Stage = mongoose.model("Stage");
      const Notification = mongoose.model("Notification");
      const Chatbot = mongoose.model("Chatbot");
      const Category = mongoose.model("Category");
      const Submission = mongoose.model("Submission"); // Added Submission

      // 1. Remove User reference from Roadmaps they are enrolled in
      await Roadmap.updateMany(
        { user: userId },
        { $pull: { user: userId } } // Remove userId from the 'user' array in Roadmap documents
      );
      console.log(` - Removed user ${userId} from associated Roadmaps.`);

      // 2. Remove User reference from Tasks they are assigned to
      await Task.updateMany(
        { user: userId },
        { $pull: { user: userId } } // Remove userId from the 'user' array in Task documents
      );
      console.log(` - Removed user ${userId} from associated Tasks.`);

      // 3. Remove User reference from Lessons (both 'user' array and 'completedby' array)
      await Lesson.updateMany(
        { $or: [{ user: userId }, { completedby: userId }] }, // Find lessons where user is in either array
        { $pull: { user: userId, completedby: userId } } // Remove userId from both arrays
      );
      console.log(
        ` - Removed user ${userId} from associated Lessons (user & completedby).`
      );

      // 4. Remove User reference from Stages they are associated with
      await Stage.updateMany(
        { user: userId },
        { $pull: { user: userId } } // Remove userId from the 'user' array in Stage documents
      );
      console.log(` - Removed user ${userId} from associated Stages.`);

      // 5. Delete Notifications assigned to the User
      const notificationResult = await Notification.deleteMany({
        assignedTo: userId,
      });
      console.log(
        ` - Deleted ${notificationResult.deletedCount} Notifications for user ${userId}.`
      );

      // 6. Delete Chatbot history assigned to the User
      const chatbotResult = await Chatbot.deleteMany({ assignedTo: userId });
      console.log(
        ` - Deleted ${chatbotResult.deletedCount} Chatbot entries for user ${userId}.`
      );

      // 7. Remove User reference from Categories they are associated with
      await Category.updateMany(
        { user: userId },
        { $pull: { user: userId } } // Remove userId from the 'user' array in Category documents
      );
      console.log(` - Removed user ${userId} from associated Categories.`);

      // 8. Delete Submissions made by the User (Added)
      const submissionResult = await Submission.deleteMany({ user: userId });
      console.log(
        ` - Deleted ${submissionResult.deletedCount} Submissions for user ${userId}.`
      );

      // 9. Delete ChatSessions owned by the User (Added)
      const ChatSession = mongoose.model("ChatSession");
      const chatSessionResult = await ChatSession.deleteMany({ user: userId });
      console.log(
        ` - Deleted ${chatSessionResult.deletedCount} Chat Sessions for user ${userId}.`
      );

      next(); // Proceed with the actual user deletion
    } catch (error) {
      console.error(`Error during cascading delete for User ${userId}:`, error);
      // Pass the error to Mongoose to halt the operation
      next(error);
    }
  },
  userSchema.pre('findOneAndDelete', async function (next) {
  const userId = this.getFilter()?._id;

  if (userId) {
    const Submission = mongoose.model('Submission');
    await Submission.deleteMany({ user: userId });
  }

  next();

}));

module.exports = mongoose.model("User", userSchema);