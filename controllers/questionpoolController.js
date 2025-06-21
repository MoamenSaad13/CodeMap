const QuestionPool = require("../models/QuestionPool"); // Assuming model path
const Category = require("../models/Category"); // Assuming Category model path and existence
const Task = require("../models/Tasks"); // Assuming Task model path and existence
const mongoose = require("mongoose");

/**
 * @description Create a new Question Pool and link it to its Category.
 * @route POST /api/question-pools
 * @access Private/Admin (example)
 */
const createQuestionPool = async (req, res) => {
  const { title, description, category, questions } = req.body;

  // Basic validation
  if (!title || !description || !category || !questions || !Array.isArray(questions)) {
    return res.status(400).json({ message: "Missing required fields or invalid questions format." });
  }

  // Validate Category ID format
  if (!mongoose.Types.ObjectId.isValid(category)) {
    return res.status(400).json({ message: "Invalid Category ID format." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Check if the category exists
    const categoryExists = await Category.findById(category).session(session);
    if (!categoryExists) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Category not found." });
    }

    // 2. Create the new Question Pool
    const newQuestionPool = new QuestionPool({
      title,
      description,
      category, // Store the ObjectId of the category
      questions,
    });

    // Validate the new question pool instance before saving
    const validationError = newQuestionPool.validateSync();
    if (validationError) {
        const errors = Object.values(validationError.errors).map(err => err.message);
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Validation failed", errors });
    }

    const savedQuestionPool = await newQuestionPool.save({ session });

    // 3. Add the Question Pool reference to the Category
    if (!categoryExists.questionpool) {
        categoryExists.questionpool = []; // Initialize if it doesn't exist
    }
    categoryExists.questionpool.push(savedQuestionPool._id);
    await categoryExists.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: "Question Pool created and linked to category successfully.",
      questionPool: savedQuestionPool,
    });

  } catch (error) {
    // Abort transaction in case of error
    await session.abortTransaction();
    session.endSession();

    console.error("Error creating question pool:", error);
    if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ message: "Validation failed during save", errors });
    }
    res.status(500).json({ message: "Server error creating question pool.", error: error.message });
  }
};

/**
 * @description Get all Question Pools.
 * @route GET /api/question-pools
 * @access Public (example)
 */
const getQuestionPools = async (req, res) => {
  try {
    const questionPools = await QuestionPool.find({}).populate('category', 'name'); // Populate category name as an example
    res.status(200).json(questionPools);
  } catch (error) {
    console.error("Error fetching question pools:", error);
    res.status(500).json({ message: "Server error fetching question pools.", error: error.message });
  }
};

/**
 * @description Get a single Question Pool by ID.
 * @route GET /api/question-pools/:id
 * @access Public (example)
 */
const getQuestionPoolById = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Question Pool ID format." });
  }

  try {
    const questionPool = await QuestionPool.findById(id).populate('category', 'name'); // Populate category name

    if (!questionPool) {
      return res.status(404).json({ message: "Question Pool not found." });
    }

    res.status(200).json(questionPool);
  } catch (error) {
    console.error("Error fetching question pool by ID:", error);
    res.status(500).json({ message: "Server error fetching question pool.", error: error.message });
  }
};

/**
 * @description Update a Question Pool by ID.
 * @route PUT /api/question-pools/:id
 * @access Private/Admin (example)
 */
const updateQuestionPool = async (req, res) => {
  const { id } = req.params;
  const { title, description, questions } = req.body; // Category change might need special handling

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Question Pool ID format." });
  }

  // Basic validation for update payload
  if (!title && !description && !questions) {
      return res.status(400).json({ message: "No update data provided." });
  }

  try {
    const questionPool = await QuestionPool.findById(id);

    if (!questionPool) {
      return res.status(404).json({ message: "Question Pool not found." });
    }

    // Update fields if provided
    if (title) questionPool.title = title;
    if (description) questionPool.description = description;
    if (questions) {
        if (!Array.isArray(questions)) {
            return res.status(400).json({ message: "Invalid questions format. Must be an array." });
        }
        questionPool.questions = questions;
    }

    const updatedQuestionPool = await questionPool.save();

    res.status(200).json({
      message: "Question Pool updated successfully.",
      questionPool: updatedQuestionPool,
    });

  } catch (error) {
    console.error("Error updating question pool:", error);
     if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ message: "Validation failed during update", errors });
    }
    res.status(500).json({ message: "Server error updating question pool.", error: error.message });
  }
};

/**
 * @description Delete a Question Pool by ID and handle cascading deletions.
 * @route DELETE /api/question-pools/:id
 * @access Private/Admin (example)
 */
const deleteQuestionPool = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Question Pool ID format." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Find the Question Pool to be deleted
    const questionPoolToDelete = await QuestionPool.findById(id).session(session);

    if (!questionPoolToDelete) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Question Pool not found." });
    }

    const categoryId = questionPoolToDelete.category;

    // 2. Find the associated Category and remove the reference
    const category = await Category.findById(categoryId).session(session);
    if (category && category.questionPools) {
      category.questionPools.pull(questionPoolToDelete._id);
      await category.save({ session });
    } else {
        console.warn(`Category ${categoryId} not found or missing 'questionPools' field while deleting Question Pool ${id}`);
    }

    // 3. Delete all Tasks referencing this Question Pool
    // Assuming Task model has a field 'questionPool' storing the ObjectId
    await Task.deleteMany({ questionPool: questionPoolToDelete._id }).session(session);

    // 4. Delete the Question Pool itself
    await QuestionPool.deleteOne({ _id: id }).session(session);

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Question Pool deleted successfully, along with associated Tasks and references removed from Category." });

  } catch (error) {
    // Abort transaction in case of error
    await session.abortTransaction();
    session.endSession();

    console.error("Error deleting question pool:", error);
    res.status(500).json({ message: "Server error deleting question pool.", error: error.message });
  }
};

module.exports = {
  createQuestionPool,
  getQuestionPools,
  getQuestionPoolById,
  updateQuestionPool,
  deleteQuestionPool,
};

