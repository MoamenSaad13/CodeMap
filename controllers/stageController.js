const mongoose = require("mongoose");

const Stage = require("../models/Stage");
const Roadmap = require("../models/Roadmap");
const Category = require("../models/Category");
const Lesson = require("../models/Lesson");
const User = require("../models/User"); // Import User model

// Create a new stage
const createStage = async (req, res) => {
  const session = await mongoose.startSession(); // Start transaction session
  session.startTransaction();
  try {
    const { title, roadmap: roadmapId } = req.body; // Use roadmapId for clarity

    // Validate roadmapId
    if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid Roadmap ID." });
    }

    // Find the maximum order value within the session
    const maxOrder = await Stage.find({ roadmap: roadmapId })
      .session(session)
      .sort({ order: -1 })
      .limit(1)
      .then((stages) => stages[0]?.order || 0);

    // Create the new stage
    const newStage = new Stage({
      title,
      roadmap: roadmapId,
      order: maxOrder + 1,
    });

    // Save the new stage within the session
    const savedStage = await newStage.save({ session });

    // Update the roadmap within the session
    const updatedRoadmap = await Roadmap.findByIdAndUpdate(
      roadmapId,
      { $addToSet: { stage: savedStage._id } }, // Use $addToSet to prevent duplicates
      { new: true, session }
    );

    if (!updatedRoadmap) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Roadmap not found" });
    }

    // --- Add new stage reference to all users enrolled in the roadmap ---
    await User.updateMany(
      { roadmap: roadmapId }, // Find users enrolled in this roadmap
      { $addToSet: { stage: savedStage._id } }, // Add the new stage ID to their 'stage' array
      { session } // Perform within the transaction
    );
    // --- End of user update ---

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Return the newly created stage as the response
    res.status(201).json(savedStage);
  } catch (error) {
    // If any error occurs, abort the transaction
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating stage:", error);
    res
      .status(500)
      .json({ message: "Server error creating stage", error: error.message });
  }
};

// Delete a stage and update the roadmap
const deleteStage = async (req, res) => {
  // 1) grab your models at runtime
  const Stage = mongoose.model("Stage");
  // Models below are used by middleware, no need to grab here unless specifically needed
  // const Roadmap  = mongoose.model('Roadmap');
  // const Category = mongoose.model('Category');
  // const Lesson   = mongoose.model('Lesson');

  try {
    const id = req.params.id;

    // 2) fetch the stage (optional, middleware handles cascade based on ID)
    // const stage = await Stage.findById(id);
    // if (!stage) {
    //   return res.status(404).json({ message: 'Stage not found' });
    // }
    // const roadmapId = stage.roadmap.toString();

    // 7) delete the stage itself using findOneAndDelete to trigger middleware
    const deletedStage = await Stage.findOneAndDelete({ _id: id });

    if (!deletedStage) {
      // This case might occur if the stage was deleted between the findById and findOneAndDelete calls
      return res
        .status(404)
        .json({ message: "Stage not found during final delete step." });
    }

    // --- Cascading logic is now handled by the pre("findOneAndDelete") hook in Stage.js model ---

    return res.status(200).json({
      message: "Stage and related data deleted successfully via cascading.",
    });
  } catch (err) {
    console.error("Error deleting stage:", err);
    return res.status(500).json({ message: err.message });
  }
};
// Get stage progress for an authenticated user
const getStageProgress = async (req, res) => {
  try {
    const { stageId } = req.params;
    const userId = req.user._id;

    console.log("1. Received stageId:", stageId);
    console.log("2. Authenticated userId:", userId);

    // Validate Stage ID
    if (!mongoose.Types.ObjectId.isValid(stageId)) {
      return res.status(400).json({ message: "Invalid Stage ID." });
    }

    const stage = await Stage.findById(stageId).select("categories").lean();
    if (!stage) {
      return res.status(404).json({ message: "Stage not found." });
    }
    console.log("3. Stage found. Categories:", stage.categories);

    // If the stage has no categories linked, progress is 0
    if (!stage.categories || stage.categories.length === 0) {
      console.log("4. Stage has no categories. Returning 0.00 progress.");
      return res.status(200).json({ progress: 0.00 });
    }

    const lessonsInStageCategories = await Lesson.find({
      category: { $in: stage.categories }
    }).select("_id").lean();
    const totalLessonsInStage = lessonsInStageCategories.length;

    console.log("5. Lessons found in stage categories:", lessonsInStageCategories.map(l => l._id.toString()));
    console.log("6. Total lessons in stage:", totalLessonsInStage);

    // If there are no lessons associated with the stage's categories, progress is 0
    if (totalLessonsInStage === 0) {
      console.log("7. No lessons found for stage categories. Returning 0.00 progress.");
      return res.status(200).json({ progress: 0.00 });
    }

    const user = await User.findById(userId).select("completedlesson").lean();
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    console.log("8. User found. Completed lessons:", user.completedlesson.map(l => l.toString()));

    const userCompletedLessonIds = new Set(user.completedlesson.map(id => id.toString()));

    let completedLessonsCount = 0;
    for (const lesson of lessonsInStageCategories) {
      if (userCompletedLessonIds.has(lesson._id.toString())) {
        completedLessonsCount++;
      }
    }

    console.log("9. Count of completed lessons in stage:", completedLessonsCount);

    const progress = (completedLessonsCount / totalLessonsInStage) * 100;

    console.log("10. Calculated progress:", progress.toFixed(2));
    res.status(200).json({ progress: progress.toFixed(2) });

  } catch (error) {
    console.error("Error getting stage progress:", error);
    res.status(500).json({
      message: "Server error getting stage progress",
      error: error.message,
    });
  }
};
// Get a stage by ID
const getStageById = async (req, res) => {
  try {
    const stageId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(stageId)) {
      return res.status(400).json({ message: "Invalid Stage ID." });
    }

    const stage = await Stage.findById(stageId)
      .populate("roadmap", "title") // Include roadmap name
      .populate("category", "title") // Include category titles
      .populate("lesson", "title"); // Include lesson titles

    if (!stage) return res.status(404).json({ message: "Stage not found" });

    res.status(200).json(stage);
  } catch (error) {
    console.error("Error getting stage by ID:", error);
    res
      .status(500)
      .json({ message: "Server error getting stage", error: error.message });
  }
};

// Get all stages (optionally filtered by roadmap)
const getAllStages = async (req, res) => {
  try {
    const roadmapId = req.query.roadmap; // Get roadmap ID from query param
    const filter = {};

    if (roadmapId) {
      if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
        return res
          .status(400)
          .json({ message: "Invalid Roadmap ID in query." });
      }
      filter.roadmap = roadmapId;
    }

    const stages = await Stage.find(filter)
      .sort("order") // Sort by order
      .populate("roadmap", "title")
      .populate("category", "title")
      .populate("lesson", "title");

    res.status(200).json(stages);
  } catch (error) {
    console.error("Error getting all stages:", error);
    res
      .status(500)
      .json({ message: "Server error getting stages", error: error.message });
  }
};

// Update a stage and update the roadmap if necessary
const updateStage = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const stageId = req.params.id;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(stageId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid Stage ID." });
    }

    // 1) Load the original Stage so we know the old roadmap
    const originalStage = await Stage.findById(stageId).session(session);
    if (!originalStage) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Stage not found" });
    }
    const oldRoadmapId = originalStage.roadmap.toString();

    // 2) Update the Stage document
    const updatedStage = await Stage.findByIdAndUpdate(stageId, updates, {
      new: true,
      session,
    });

    if (!updatedStage) {
      // Should not happen if findById worked, but good practice
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ message: "Stage not found after update attempt" });
    }

    // 3) If the roadmap changed, move refs and fix child docs
    const newRoadmapId = updatedStage.roadmap.toString();
    if (updates.roadmap && newRoadmapId !== oldRoadmapId) {
      if (!mongoose.Types.ObjectId.isValid(newRoadmapId)) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({ message: "Invalid new Roadmap ID provided in update." });
      }

      // a) Remove from old roadmap
      await Roadmap.findByIdAndUpdate(
        oldRoadmapId,
        { $pull: { stage: stageId } },
        { session }
      );

      // b) Add to new roadmap
      const newRoadmapDoc = await Roadmap.findByIdAndUpdate(
        newRoadmapId,
        { $addToSet: { stage: stageId } }, // Use $addToSet
        { new: true, session }
      );
      if (!newRoadmapDoc) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ message: "New roadmap specified in update not found." });
      }

      // c) Update all Categories under this stage so their roadmap field matches
      await Category.updateMany(
        { stage: stageId },
        { $set: { roadmap: newRoadmapId } },
        { session }
      );

      // d) Update all Lessons under this stage too
      await Lesson.updateMany(
        { stage: stageId },
        { $set: { roadmap: newRoadmapId } },
        { session }
      );

      // --- Update Users: Remove stage from users of old roadmap, add to users of new roadmap ---
      // Remove stage ref from users only enrolled in the old roadmap (and not the new one)
      await User.updateMany(
        { roadmap: oldRoadmapId, _id: { $nin: newRoadmapDoc.user } }, // Users in old roadmap but NOT in new one
        { $pull: { stage: stageId } },
        { session }
      );
      // Add stage ref to users enrolled in the new roadmap
      await User.updateMany(
        { roadmap: newRoadmapId },
        { $addToSet: { stage: stageId } },
        { session }
      );
      // --- End User Update ---
    }

    await session.commitTransaction();
    session.endSession();

    // 4) Populate and return the updated stage
    const populatedStage = await Stage.findById(updatedStage._id)
      .populate("roadmap", "title")
      .populate("category", "title")
      .populate("lesson", "title");

    return res.status(200).json(populatedStage);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in updateStage:", error);
    return res
      .status(500)
      .json({ message: "Server error updating stage", error: error.message });
  }
};

// Get stages by roadmap ID
const getStagesByRoadmap = async (req, res) => {
  const roadmapId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
    return res.status(400).json({ message: "Invalid Roadmap ID." });
  }

  try {
    const stages = await Stage.find({ roadmap: roadmapId })
      .sort("order") // Sort by order
      .populate("roadmap", "title")
      .populate("category", "title")
      .populate({
        path: "lesson",
        select: "title link lesson_duration lecture_number",
      });
      
    // No need to return 404 if empty, an empty array is valid
    // if (!stages || stages.length === 0) {
    //     return res.status(404).json({ message: 'No stages found for this roadmap.' });
    // }

    res.status(200).json(stages);
  } catch (error) {
    console.error("Error fetching stages by roadmap:", error);
    res.status(500).json({
      message: "Server error fetching stages for roadmap",
      error: error.message,
    });
  }
};

module.exports = {
  createStage,
  deleteStage,
  getStageProgress,
  getStageById,
  getAllStages,
  updateStage,
  getStagesByRoadmap,
};
