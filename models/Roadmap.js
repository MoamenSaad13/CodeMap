const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// REMOVED top-level require statements for other models to prevent circular dependencies
// const Stage = require("./Stage");
// const Lesson = require("./Lesson");
// const Category = require("./Category");
// const User = require("./User");
// const Chatbot = require("./Chatbot");

const roadmapSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    requirments: {
      // Typo: should likely be requirements
      type: String,
      required: true,
    },
    image: {
      type: String,
      default: null,
    },
    target_audience: {
      type: String,
      required: true,
    },
    user: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    stage: [
      {
        type: Schema.Types.ObjectId,
        ref: "Stage",
      },
    ],
    category: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    lesson: [
      {
        type: Schema.Types.ObjectId,
        ref: "Lesson",
      },
    ],

    /**
     * @description Array of questions within this task.
     */
    header: [
      {
        title: {
          type: String,
        },
        subTitle: {
          type: String,
        },
      }
    ],
    description: {
      type: String,
    },
    core_languages: [
    {
      name: { type: String, required: true },
      icon: { type: String, required: true } // image URL
    }
    ],

    popular_frameworks: [
    {
      name: { type: String, required: true },
      icon: { type: String, required: true } // image URL
    }
  ],

  development_tools: [
    {
      name: { type: String, required: true },
      icon: { type: String, required: true } // image URL
    }
  ],
  career_opportunities: {
    type: String,
    required: false
  },

  advanced_topics: {
     type: String,
   }, // array of advanced topics

  project_based_learning: {
    type: String
  },

  testimonials: {
     type: String
  },

},

  { timestamps: true }
);

// --- Middleware for Cascading Deletes ---

roadmapSchema.pre(
  "findOneAndDelete",
  { document: false, query: true },
  async function (next) {
    const docToDelete = await this.model.findOne(this.getFilter()).lean();
    if (!docToDelete) {
      console.log("Roadmap pre-delete hook: Document not found, skipping cascade.");
      return next();
    }
    const roadmapId = docToDelete._id;

    console.log(`Cascading delete initiated for Roadmap ID: ${roadmapId}`);

    try {
      // --- Define models inside the hook using mongoose.model() for reliability ---
      const Stage = mongoose.model("Stage");
      const Lesson = mongoose.model("Lesson");
      const Category = mongoose.model("Category");
      const User = mongoose.model("User");
      const Chatbot = mongoose.model("Chatbot");
      const QuestionPool = mongoose.model("QuestionPool");

      // --- Perform cascading actions ---

      // 1. Find Categories associated with this Roadmap
      const categoriesInRoadmap = await Category.find({ roadmap: roadmapId }).lean();
      console.log(` - Found ${categoriesInRoadmap.length} associated Categories.`);

      // 2. Find and delete QuestionPools associated with these Categories
      let questionPoolIdsToDelete = [];
      categoriesInRoadmap.forEach(cat => {
        if (cat.questionpool && cat.questionpool.length > 0) {
          questionPoolIdsToDelete = questionPoolIdsToDelete.concat(cat.questionpool.map(qpId => qpId.toString()));
        }
      });
      questionPoolIdsToDelete = [...new Set(questionPoolIdsToDelete)];

      if (questionPoolIdsToDelete.length > 0) {
        console.log(` - Found ${questionPoolIdsToDelete.length} unique Question Pools associated with categories to delete.`);
        await QuestionPool.deleteMany({ _id: { $in: questionPoolIdsToDelete } });
        console.log(` - Finished deleting associated Question Pools.`);
      }

      // 3. Find and delete related Stages (triggers their own pre-delete hooks)
      const stagesToDelete = await Stage.find({ roadmap: roadmapId }).select("_id").lean();
      if (stagesToDelete.length > 0) {
        console.log(` - Found ${stagesToDelete.length} associated Stages to delete.`);
        for (const stage of stagesToDelete) {
          await Stage.findOneAndDelete({ _id: stage._id });
        }
        console.log(` - Finished deleting associated Stages (and their cascades).`);
      }

      // 4. Explicitly delete related Lessons (if not handled by Stage cascade)
      const lessonDeleteResult = await Lesson.deleteMany({ roadmap: roadmapId });
      if (lessonDeleteResult.deletedCount > 0) {
          console.log(` - Explicitly deleted ${lessonDeleteResult.deletedCount} Lessons associated with the Roadmap.`);
      }
      
      // 5. Explicitly delete related Categories (if not handled by Stage cascade)
      // Note: This is slightly redundant if Stage cascade works, but ensures cleanup.
      const categoryDeleteResult = await Category.deleteMany({ roadmap: roadmapId });
       if (categoryDeleteResult.deletedCount > 0) {
          console.log(` - Explicitly deleted ${categoryDeleteResult.deletedCount} Categories associated with the Roadmap.`);
      }

      // 6. Remove Roadmap reference from Users
      await User.updateMany(
        { roadmap: roadmapId }, 
        { $pull: { roadmap: roadmapId } } 
      );
      console.log(` - Removed roadmap reference from associated Users.`);

      // 7. Delete Chatbot records recommending this Roadmap
      await Chatbot.deleteMany({ recommended_Roadmap: roadmapId });
      console.log(` - Deleted Chatbot records recommending this Roadmap.`);

      // 8. Update ChatSessions that have this roadmap as last_suggested_roadmap
      const ChatSession = mongoose.model("ChatSession");
      await ChatSession.updateMany(
        { last_suggested_roadmap: roadmapId },
        { $unset: { last_suggested_roadmap: 1 }, roadmap_confirmed: false }
      );
      console.log(` - Updated Chat Sessions that referenced this Roadmap.`);

      console.log(`Cascading delete for Roadmap ${roadmapId} completed successfully.`);
      next();

    } catch (error) {
      console.error(
        `Error during cascading delete for Roadmap ${roadmapId}:`,
        error
      );
      next(error);
    }
  },
  roadmapSchema.pre('findOneAndDelete', async function (next) {
  const roadmapId = this.getFilter()?._id;

  if (roadmapId) {
    const Submission = mongoose.model('Submission');
    await Submission.deleteMany({ roadmap: roadmapId });
  }

  next();
}));

module.exports = mongoose.model("Roadmap", roadmapSchema);