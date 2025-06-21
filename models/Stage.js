const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const Lesson = require("./Lesson");
const Category = require("./Category");
const Roadmap = require("./Roadmap");
const User = require("./User");

const stageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    order: {
      type: Number,
      default: null,
    },
    progress: {
      type: mongoose.Schema.Types.Decimal128, // Consider if this is calculated or stored
      default: null,
    },
    roadmap: {
      type: Schema.Types.ObjectId,
      ref: "Roadmap",
      required: true,
    },
    lesson: [
      {
        type: Schema.Types.ObjectId,
        ref: "Lesson",
      },
    ],
    category: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    user: {
      // This seems to imply only one user per stage? Or is it creator? Check usage.
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// --- Middleware for Cascading Deletes ---

// Before deleting a Stage, clean up related data
stageSchema.pre(
  "findOneAndDelete",
  { document: false, query: true },
  async function (next) {
    const docToDelete = await this.model.findOne(this.getFilter());
    if (!docToDelete) {
      return next(); // Document not found, nothing to cascade
    }
    const stageId = docToDelete._id;
    const roadmapId = docToDelete.roadmap; // Get the parent roadmap ID

    console.log(`Cascading delete for Stage ID: ${stageId}`);

    try {
      // Need to require models here
      const Lesson = mongoose.model("Lesson");
      const Category = mongoose.model("Category");
      const Roadmap = mongoose.model("Roadmap");
      const User = mongoose.model("User");

      // 1. Find and delete related Lessons (and trigger their cascade)
      const lessonsToDelete = await Lesson.find({ stage: stageId });
      for (const lesson of lessonsToDelete) {
        await Lesson.findOneAndDelete({ _id: lesson._id }); // Triggers Lesson's pre-hook
      }

      // 2. Find and delete related Categories (and trigger their cascade)
      const categoriesToDelete = await Category.find({ stage: stageId });
      for (const category of categoriesToDelete) {
        await Category.findOneAndDelete({ _id: category._id }); // Triggers Category's pre-hook
      }

      // 3. Remove Stage reference from the parent Roadmap
      if (roadmapId) {
        await Roadmap.updateOne(
          { _id: roadmapId },
          { $pull: { stage: stageId } }
        );
      }

      // 4. Remove Stage reference from Users (if the user field is used this way)
      // Assuming the 'user' field in Stage is not the primary link, but check User model
      // If User model has a 'stage' array:
      await User.updateMany({ stage: stageId }, { $pull: { stage: stageId } });

      // Note: The 'lesson' and 'category' arrays in the Stage document being deleted
      // are just references. Deleting the source Lessons/Categories is the main action.

      next();
    } catch (error) {
      console.error(
        `Error during cascading delete for Stage ${stageId}:`,
        error
      );
      next(error);
    }
  }
);

module.exports = mongoose.model("Stage", stageSchema);