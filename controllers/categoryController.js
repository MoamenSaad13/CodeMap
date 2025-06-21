const mongoose = require("mongoose");

const Category = require("../models/Category");
const Stage = require("../models/Stage");
const Roadmap = require("../models/Roadmap");
const Lesson = require("../models/Lesson");
const User = require("../models/User"); // Import User model, although not directly used in createCategory for linking

// Create a new category
const createCategory = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { title, stageId } = req.body;

    // Ensure title and stageId are provided
    if (!title || !stageId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "Missing required fields: title or stageId" });
    }

    // Validate stageId
    if (!mongoose.Types.ObjectId.isValid(stageId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid Stage ID." });
    }

    // Find the stage by ID within the session
    const stage = await Stage.findById(stageId).session(session);
    if (!stage) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Stage not found" });
    }

    // Get the roadmapId from the stage
    const roadmapId = stage.roadmap; // Assuming stage.roadmap is populated or just the ID

    if (!roadmapId) {
      // This case implies data inconsistency if a stage doesn't have a roadmap
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "Stage does not have an associated roadmap" });
    }

    // Create the new category
    const category = new Category({
      title,
      stage: stage._id,
      roadmap: roadmapId,
    });

    // Save the category within the session
    const savedCategory = await category.save({ session });

    // Update the Stage document within the session
    await Stage.findByIdAndUpdate(
      stageId,
      { $addToSet: { category: savedCategory._id } }, // Use $addToSet
      { session }
    );

    // Update the Roadmap document within the session
    await Roadmap.findByIdAndUpdate(
      roadmapId,
      { $addToSet: { category: savedCategory._id } }, // Use $addToSet
      { session }
    );

    // Note: As per strategy, we are NOT linking the category directly to users here.
    // Users access categories via the stages they are linked to.

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Return the newly created category
    res.status(201).json(savedCategory);
  } catch (error) {
    // Abort transaction on error
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating category:", error);
    res.status(500).json({
      message: "Server error creating category",
      error: error.message,
    });
  }
};

// Get all categories (optionally filtered by roadmap or stage)
const getAllCategories = async (req, res) => {
  try {
    const { roadmapId, stageId } = req.query;
    const filter = {};

    if (roadmapId) {
      if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
        return res
          .status(400)
          .json({ message: "Invalid Roadmap ID in query." });
      }
      filter.roadmap = roadmapId;
    }
    if (stageId) {
      if (!mongoose.Types.ObjectId.isValid(stageId)) {
        return res.status(400).json({ message: "Invalid Stage ID in query." });
      }
      filter.stage = stageId;
    }

    const categories = await Category.find(filter)
      .populate("roadmap", "title")
      .populate("stage", "title")
      .populate("lesson", "title");

    res.status(200).json(categories);
  } catch (error) {
    console.error("Error getting all categories:", error);
    res.status(500).json({
      message: "Server error getting categories",
      error: error.message,
    });
  }
};

// Get category by ID
const getCategoryById = async (req, res) => {
  try {
    const categoryId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ message: "Invalid Category ID." });
    }

    const category = await Category.findById(categoryId)
      .populate("roadmap", "title")
      .populate("stage", "title")
      .populate("lesson", "title");

    if (!category)
      return res.status(404).json({ message: "Category not found" });
    res.status(200).json(category);
  } catch (error) {
    console.error("Error getting category by ID:", error);
    res
      .status(500)
      .json({ message: "Server error getting category", error: error.message });
  }
};

// Update a category and propagate changes if stage/roadmap changes
const updateCategory = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const categoryId = req.params.id;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid Category ID." });
    }

    // Find original category
    const originalCategory =
      await Category.findById(categoryId).session(session);
    if (!originalCategory) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Category not found" });
    }
    const oldStageId = originalCategory.stage.toString();
    const oldRoadmapId = originalCategory.roadmap.toString();

    // Perform the update
    const updatedCategory = await Category.findByIdAndUpdate(
      categoryId,
      updates,
      { new: true, session }
    );

    if (!updatedCategory) {
      // Should not happen if findById worked
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ message: "Category not found after update attempt" });
    }

    const newStageId = updatedCategory.stage.toString();
    const newRoadmapId = updatedCategory.roadmap.toString();

    // --- Handle potential Stage change ---
    if (updates.stage && newStageId !== oldStageId) {
      if (!mongoose.Types.ObjectId.isValid(newStageId)) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({ message: "Invalid new Stage ID provided in update." });
      }
      // Remove from old stage
      await Stage.findByIdAndUpdate(
        oldStageId,
        { $pull: { category: categoryId } },
        { session }
      );
      // Add to new stage
      const newStageDoc = await Stage.findByIdAndUpdate(
        newStageId,
        { $addToSet: { category: categoryId } },
        { new: true, session }
      );
      if (!newStageDoc) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ message: "New stage specified in update not found." });
      }
      // Update category's roadmap ref if stage change implies roadmap change
      if (newStageDoc.roadmap.toString() !== newRoadmapId) {
        updatedCategory.roadmap = newStageDoc.roadmap;
        await updatedCategory.save({ session }); // Save updated roadmap ref in category
        // Also need to handle roadmap array updates below
      }
    }

    // --- Handle potential Roadmap change (if not already handled by stage change) ---
    const finalRoadmapId = updatedCategory.roadmap.toString(); // Use potentially updated roadmap ID
    if (finalRoadmapId !== oldRoadmapId) {
      // Remove from old roadmap
      await Roadmap.findByIdAndUpdate(
        oldRoadmapId,
        { $pull: { category: categoryId } },
        { session }
      );
      // Add to new roadmap
      const newRoadmapDoc = await Roadmap.findByIdAndUpdate(
        finalRoadmapId,
        { $addToSet: { category: categoryId } },
        { new: true, session }
      );
      if (!newRoadmapDoc) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ message: "New roadmap specified in update not found." });
      }
      // Update lessons associated with this category to point to the new roadmap
      await Lesson.updateMany(
        { category: categoryId },
        { $set: { roadmap: finalRoadmapId } },
        { session }
      );
    }

    // Note: No direct user linking for categories.

    await session.commitTransaction();
    session.endSession();

    // Populate and return
    const populatedCategory = await Category.findById(updatedCategory._id)
      .populate("roadmap", "title")
      .populate("stage", "title")
      .populate("lesson", "title");

    res.status(200).json(populatedCategory);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating category:", error);
    res.status(500).json({
      message: "Server error updating category",
      error: error.message,
    });
  }
};

// Delete a category
const deleteCategory = async (req, res) => {
  // Models used by middleware, no need to grab here
  // const Category = mongoose.model("Category");
  // const Stage    = mongoose.model("Stage");
  // const Roadmap  = mongoose.model("Roadmap");
  // const Lesson   = mongoose.model("Lesson");

  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Category ID." });
    }

    // Find category (optional, middleware handles cascade based on ID)
    // const category = await Category.findById(id);
    // if (!category) {
    //   return res.status(404).json({ message: "Category not found" });
    // }

    // Delete the category itself using findOneAndDelete to trigger middleware
    const deletedCategory = await Category.findOneAndDelete({ _id: id });

    if (!deletedCategory) {
      return res
        .status(404)
        .json({ message: "Category not found during final delete step." });
    }

    // --- Cascading logic is now handled by the pre("findOneAndDelete") hook in Category.js model ---

    return res.status(200).json({
      message: "Category and related data deleted successfully via cascading.",
    });
  } catch (err) {
    console.error("Error deleting category:", err);
    return res
      .status(500)
      .json({ message: "Server error deleting category", error: err.message });
  }
};

// Get categories by roadmap ID
const getCategoriesByRoadmap = async (req, res) => {
  const roadmapId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
    return res.status(400).json({ message: "Invalid Roadmap ID." });
  }

  try {
    // Find categories directly linked to the roadmap
    const categories = await Category.find({ roadmap: roadmapId })
      .populate("roadmap", "title")
      .populate("stage", "title")
      .populate("lesson", "title");

    res.status(200).json(categories);
  } catch (error) {
    console.error("Error fetching categories by roadmap:", error);
    res.status(500).json({
      message: "Server error fetching categories for roadmap",
      error: error.message,
    });
  }
};

// Get categories by stage ID
const getCategoriesByStage = async (req, res) => {
  const stageId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(stageId)) {
    return res.status(400).json({ message: "Invalid Stage ID." });
  }

  try {
    const categories = await Category.find({ stage: stageId })
      .populate("roadmap", "title")
      .populate("stage", "title")
      .populate("lesson", "title");

    // No need for 404 if empty
    // if (!categories || categories.length === 0) {
    //     return res.status(404).json({ message: "No categories found for this stage." });
    // }

    res.status(200).json(categories);
  } catch (error) {
    console.error("Error fetching categories by stage:", error);
    res.status(500).json({
      message: "Server error fetching categories for stage",
      error: error.message,
    });
  }
};

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getCategoriesByRoadmap,
  getCategoriesByStage,
};
