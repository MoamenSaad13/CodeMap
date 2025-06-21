const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// REMOVED top-level require statements for other models to prevent circular dependencies

const categorySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    stage: {
      type: Schema.Types.ObjectId,
      ref: "Stage",
      required: true,
    },
    roadmap: {
      type: Schema.Types.ObjectId,
      ref: "Roadmap",
    },
    lesson: [
      {
        type: Schema.Types.ObjectId,
        ref: "Lesson",
      },
    ],
    task: [
      {
        type: Schema.Types.ObjectId,
        ref: "Tasks", 
      },
    ],
    user: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    quizQuestionCount: {
      type: Number,
      default: 10,
      min: [1, 'Must have at least one question.']
    },
     questionpool: [
      {
        type: Schema.Types.ObjectId,
        ref: "QuestionPool",
      },
    ],
  },
  { timestamps: true }
);

// --- Middleware for Cascading Deletes (Professional Refactor) ---

categorySchema.pre(
  "findOneAndDelete",
  { document: false, query: true },
  async function (next) {
    // Get the document being deleted to access its properties
    // Use lean() for performance as we only need IDs and referenced IDs
    const docToDelete = await this.model.findOne(this.getFilter()).lean(); 
    if (!docToDelete) {
      console.log("Category pre-delete hook: Document not found, skipping cascade.");
      return next(); // Nothing to cascade
    }
    const categoryId = docToDelete._id;
    const stageId = docToDelete.stage;
    const roadmapId = docToDelete.roadmap;

    console.log(`Cascading delete initiated for Category ID: ${categoryId}`);

    try {
      // --- Perform cascading actions, getting models JUST before use ---

      // 1. Delete related Lessons
      const Lesson = mongoose.model("Lesson"); // Get model
      const lessonsToDelete = await Lesson.find({ category: categoryId }).select("_id").lean();
      if (lessonsToDelete.length > 0) {
        console.log(` - Found ${lessonsToDelete.length} associated Lessons to delete.`);
        for (const lesson of lessonsToDelete) {
          // Note: findOneAndDelete on Lesson might trigger its own pre-hooks
          await Lesson.findOneAndDelete({ _id: lesson._id }); 
        }
        console.log(` - Finished deleting associated Lessons.`);
      }

      // 2. Delete related Tasks
      const Task = mongoose.model("Tasks"); // Get model
      const tasksToDelete = await Task.find({ category: categoryId }).select("_id").lean();
      if (tasksToDelete.length > 0) {
        console.log(` - Found ${tasksToDelete.length} associated Tasks to delete.`);
        for (const task of tasksToDelete) {
          // Note: findOneAndDelete on Task might trigger its own pre-hooks
          await Task.findOneAndDelete({ _id: task._id }); 
        }
        console.log(` - Finished deleting associated Tasks.`);
      }

      // 3. Remove Category reference from parent Stage
      if (stageId) {
        const Stage = mongoose.model("Stage"); // Get model
        await Stage.updateOne(
          { _id: stageId },
          { $pull: { category: categoryId } }
        );
        console.log(` - Removed category reference from parent Stage ${stageId}.`);
      }

      // 4. Remove Category reference from parent Roadmap
      if (roadmapId) {
        const Roadmap = mongoose.model("Roadmap"); // Get model
        await Roadmap.updateOne(
          { _id: roadmapId },
          { $pull: { category: categoryId } }
        );
        console.log(` - Removed category reference from parent Roadmap ${roadmapId}.`);
      }

      // 5. Remove Category reference from associated Users (if applicable)
      const User = mongoose.model("User"); // Get model
      // Assuming users might reference categories directly. Adjust field name if necessary.
      await User.updateMany(
        { category: categoryId }, 
        { $pull: { category: categoryId } } 
      );
      console.log(` - Removed category reference from associated Users.`);

      // 6. Delete associated Question Pools
      if (docToDelete.questionpool && docToDelete.questionpool.length > 0) {
        const QuestionPool = mongoose.model("QuestionPool"); // Get model
        const questionPoolIds = docToDelete.questionpool.map(id => id.toString());
        await QuestionPool.deleteMany({ _id: { $in: questionPoolIds } });
        console.log(` - Deleted ${questionPoolIds.length} associated Question Pools.`);
      }

      console.log(`Cascading delete for Category ${categoryId} completed successfully.`);
      next(); // Proceed with the actual category deletion

    } catch (error) {
      console.error(
        `Error during cascading delete for Category ${categoryId}:`,
        error
      );
      next(error); // Pass error to Mongoose
    }
  }
);

module.exports = mongoose.model("Category", categorySchema);
