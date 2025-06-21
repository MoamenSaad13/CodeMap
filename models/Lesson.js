const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// REMOVED top-level require statements for other models to prevent circular dependencies
// const Category = require("./Category");
// const Roadmap = require("./Roadmap");
// const Stage = require("./Stage");
// const User = require("./User");

const lessonSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    link: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      enum: ["AR", "ENG"],
    },
    lesson_duration: {
      type: Number,
      required: true,
    },
    lecture_number: {
      type: Number,
    },
    rate: {
      type: Number,
      default: 0,
    },
    number_of_students: {
      type: Number,
      default: 0,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    roadmap: {
      type: Schema.Types.ObjectId,
      ref: "Roadmap",
      required: true,
    },
    stage: {
      type: Schema.Types.ObjectId,
      ref: "Stage",
      required: true,
    },
    user: [
      {
        // Users potentially enrolled? Check usage.
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    completedby: [
      {
        // Users who completed the lesson
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

// --- Middleware for Cascading Deletes (Professional Refactor) ---

lessonSchema.pre(
  "findOneAndDelete",
  { document: false, query: true },
  async function (next) {
    // Get the document being deleted to access its properties
    const docToDelete = await this.model.findOne(this.getFilter()).lean(); // Use lean
    if (!docToDelete) {
      console.log("Lesson pre-delete hook: Document not found, skipping cascade.");
      return next(); // Nothing to cascade
    }
    const lessonId = docToDelete._id;
    const roadmapId = docToDelete.roadmap;
    const stageId = docToDelete.stage;
    const categoryId = docToDelete.category;

    console.log(`Cascading delete initiated for Lesson ID: ${lessonId}`);

    try {
      // --- Perform cascading actions, getting models JUST before use ---

      // 1. Remove Lesson reference from the parent Roadmap
      if (roadmapId) {
        const Roadmap = mongoose.model("Roadmap"); // Get model
        await Roadmap.updateOne(
          { _id: roadmapId },
          { $pull: { lesson: lessonId } }
        );
        console.log(` - Removed lesson reference from parent Roadmap ${roadmapId}.`);
      }

      // 2. Remove Lesson reference from the parent Stage
      if (stageId) {
        const Stage = mongoose.model("Stage"); // Get model
        await Stage.updateOne(
          { _id: stageId },
          { $pull: { lesson: lessonId } }
        );
        console.log(` - Removed lesson reference from parent Stage ${stageId}.`);
      }

      // 3. Remove Lesson reference from the parent Category
      if (categoryId) {
        const Category = mongoose.model("Category"); // Get model
        await Category.updateOne(
          { _id: categoryId },
          { $pull: { lesson: lessonId } }
        );
        console.log(` - Removed lesson reference from parent Category ${categoryId}.`);
      }

      // 4. Remove Lesson reference from Users (both enrolled and completed)
      const User = mongoose.model("User"); // Get model
      // Assuming 'completedlesson' is the correct field name in the User model for completed lessons
      // Adjust field names if they are different in your User schema
      await User.updateMany(
        { $or: [{ lesson: lessonId }, { completedlesson: lessonId }] }, // Check if user references this lesson in either field
        { $pull: { lesson: lessonId, completedlesson: lessonId } } // Remove reference from both fields
      );
      console.log(` - Removed lesson reference from associated Users.`);

      console.log(`Cascading delete for Lesson ${lessonId} completed successfully.`);
      next(); // Proceed with the actual lesson deletion

    } catch (error) {
      console.error(
        `Error during cascading delete for Lesson ${lessonId}:`,
        error
      );
      next(error); // Pass error to Mongoose
    }
  }
);

module.exports = mongoose.model("Lesson", lessonSchema);
