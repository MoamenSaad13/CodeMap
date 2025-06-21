const mongoose = require("mongoose");
const Task = require("../models/Tasks");
const User = require("../models/User");
const Category = require("../models/Category");
const QuestionPool = require("../models/QuestionPool");
const Notification = require("../models/Notification");
const Lesson = require("../models/Lesson");
const Submission = require("../models/Submission");

/**
 * @description Get all tasks.
 * @route GET /tasks
 * @access Private (Admin only)
 */
const getAllTasks = async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate("category", "title")
      .populate("user", "first_name last_name email")
      .sort({ createdAt: -1 }) // Sort by creation date, newest first
      .lean();

    res.json(tasks);
  } catch (error) {
    console.error("Error getting all tasks:", error);
    res.status(500).json({
      message: "Server error getting tasks",
      error: error.message,
    });
  }
};

/**
 * @description Get a specific task by ID.
 * @route GET /tasks/:id
 * @access Private (Admin or assigned user)
 */
const getTaskById = async (req, res) => {
  const { id } = req.params;
  const requestingUserId = req.user.id;
  const requestingUserRole = req.user.role;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Task ID." });
  }

  try {
    const task = await Task.findById(id)
      .populate({
        path:"category",
        select: "title roadmap",
      })
      .populate("user", "first_name last_name email")
      .lean();
    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    // Authorization check: Allow admin or assigned users
    if (
  requestingUserRole !== "admin" &&
  task.user._id.toString() !== requestingUserId
  ) {
  return res.status(403).json({
    message: "Forbidden: You are not authorized to view this task.",
  });
}

    res.json(task);
  } catch (error) {
    console.error("Error getting task by ID:", error);
    res.status(500).json({
      message: "Server error getting task",
      error: error.message,
    });
  }
};

/**
 * @description Update a specific task.
 * @route PUT /tasks/:id
 * @access Private (Admin only)
 */
const updateTask = async (req, res) => {
  // Ensure only admins can update tasks
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin role required" });
  }

  const { id } = req.params;
  const updateData = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Task ID." });
  }

  // Prevent updating certain fields directly
  const restrictedFields = ["_id", "createdAt", "updatedAt"];
  for (const field of restrictedFields) {
    if (field in updateData) {
      delete updateData[field];
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Get the current task to check for user changes
    const currentTask = await Task.findById(id).session(session);
    if (!currentTask) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Task not found." });
    }

    // Handle user assignments if they've changed
    if (updateData.user && Array.isArray(updateData.user)) {
      // Validate all user IDs
      for (const userId of updateData.user) {
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: `Invalid User ID: ${userId}`,
          });
        }
      }

      // Check if all users exist
      const userCount = await User.countDocuments({
        _id: { $in: updateData.user },
      }).session(session);
      if (userCount !== updateData.user.length) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          message: "One or more users not found.",
        });
      }

      // Get current user assignments for comparison
      const currentUserIds = currentTask.user.map((id) => id.toString());
      const newUserIds = updateData.user;

      // Users to remove (in current but not in new)
      const usersToRemove = currentUserIds.filter(
        (id) => !newUserIds.includes(id)
      );

      // Users to add (in new but not in current)
      const usersToAdd = newUserIds.filter(
        (id) => !currentUserIds.includes(id)
      );

      // Remove task reference from users no longer assigned
      if (usersToRemove.length > 0) {
        await User.updateMany(
          { _id: { $in: usersToRemove } },
          { $pull: { task: id } },
          { session }
        );
      }

      // Add task reference to newly assigned users
      if (usersToAdd.length > 0) {
        await User.updateMany(
          { _id: { $in: usersToAdd } },
          { $addToSet: { task: id } },
          { session }
        );
      }
    }

    // Handle category change if it's changed
    if (
      updateData.category &&
      mongoose.Types.ObjectId.isValid(updateData.category) &&
      updateData.category !== currentTask.category.toString()
    ) {
      // Validate new category
      const newCategoryExists = await Category.findById(updateData.category)
        .session(session)
        .lean();
      if (!newCategoryExists) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "New category not found." });
      }

      // Remove task reference from old category
      await Category.findByIdAndUpdate(
        currentTask.category,
        { $pull: { task: id } },
        { session }
      );

      // Add task reference to new category
      await Category.findByIdAndUpdate(
        updateData.category,
        { $addToSet: { task: id } },
        { session }
      );
    }

    // Update the task
    const updatedTask = await Task.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Task updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating task:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: "Validation error updating task",
        errors: error.errors,
      });
    }

    res.status(500).json({
      message: "Server error updating task",
      error: error.message,
    });
  }
};

/**
 * @description Delete a specific task.
 * @route DELETE /tasks/:id
 * @access Private (Admin only)
 */
const deleteTask = async (req, res) => {
  // Ensure only admins can delete tasks
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin role required" });
  }

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Task ID." });
  }

  try {
    // Use findOneAndDelete to trigger the pre-hook for cascading deletes
    const deletedTask = await Task.findOneAndDelete({ _id: id });

    if (!deletedTask) {
      return res.status(404).json({ message: "Task not found." });
    }

    res.json({
      message: "Task deleted successfully",
      task: deletedTask,
    });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({
      message: "Server error deleting task",
      error: error.message,
    });
  }
};

/**
 * @description Get all tasks assigned to the authenticated user.
 * @route GET /tasks/my-tasks
 * @access Private (User getting their own)
 */
const getMyTasks = async (req, res) => {
  const userId = req.user.id;

  try {
    const tasks = await Task.find({ user: userId })
      .populate("category", "title")
      .sort({ createdAt: -1 }) // Sort by creation date, newest first
      .lean();

    res.json(tasks);
  } catch (error) {
    console.error("Error getting user tasks:", error);
    res.status(500).json({
      message: "Server error getting tasks",
      error: error.message,
    });
  }
};

/**
 * @description Helper function to select random questions from pools.
 * @param {Array} questionPools - Array of question pool objects with pool ID and count.
 * @param {Object} randomizationSettings - Settings for randomization.
 * @returns {Array} - Array of selected questions.
 */
const selectRandomQuestions = async (questionPools, randomizationSettings) => {
  try {
    const selectedQuestions = [];
    
    // If question pools are provided, select questions from each pool
    if (questionPools && questionPools.length > 0) {
      for (const poolConfig of questionPools) {
        const pool = await QuestionPool.findById(poolConfig.pool).lean();
        if (!pool || !pool.questions || pool.questions.length === 0) {
          continue;
        }
        
        // Shuffle the questions
        const shuffled = [...pool.questions].sort(() => 0.5 - Math.random());
        
        // Select the specified number of questions
        const selected = shuffled.slice(0, Math.min(poolConfig.count, shuffled.length));
        selectedQuestions.push(...selected);
      }
    }
    // If randomization settings are provided, select questions based on criteria
    else if (randomizationSettings) {
      const settings = randomizationSettings;
      
      // Get all question pools for the category if specified
      let allQuestions = [];
      
      // If difficulty distribution is specified
      if (settings.difficultyDistribution) {
        const difficulties = Object.keys(settings.difficultyDistribution);
        for (const difficulty of difficulties) {
          const count = settings.difficultyDistribution[difficulty];
          if (count > 0) {
            const pools = await QuestionPool.find({ 
              difficultyLevel: difficulty 
            }).lean();
            
            for (const pool of pools) {
              // Filter to only include multiple choice questions
              const multipleChoiceQuestions = pool.questions.filter(q => q.questionType === "multiple_choice");
              allQuestions.push(...multipleChoiceQuestions);
            }
          }
        }
      }
      // If only question count is specified
      else if (settings.questionCount) {
        const pools = await QuestionPool.find().lean();
        for (const pool of pools) {
          // Filter to only include multiple choice questions
          const multipleChoiceQuestions = pool.questions.filter(q => q.questionType === "multiple_choice");
          allQuestions.push(...multipleChoiceQuestions);
        }
        
        // Shuffle and select
        const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, Math.min(settings.questionCount, allQuestions.length));
        selectedQuestions.push(...selected);
      }
    }
    
    return selectedQuestions;
  } catch (error) {
    console.error("Error selecting random questions:", error);
    throw error;
  }
};

/**
 * @description Start a quiz task and update its status
 * 
 * @route POST /tasks/:taskId/start
 * @access Private (User)
 */
const startQuiz = async (req, res) => {
  const { taskId } = req.params;
  const userId = req.user.id;

  try {
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: "Invalid Task ID format" });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.user.toString() !== userId) {
      return res.status(403).json({ message: "Task not assigned to this user" });
    }

    if (task.status !== "pending") {
      return res.status(400).json({ message: `Task is already ${task.status}` });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      task.status = "in-progress";

      // Ensure userSessions array is initialized
      if (!task.userSessions) {
        task.userSessions = [];
      }

      // Add or update user session
      const userSessionIndex = task.userSessions.findIndex(session => session.user.toString() === userId);

      if (userSessionIndex === -1) {
        task.userSessions.push({
          user: userId,
          startedAt: new Date(),
          completed: false,
          score: null
        });
      } else {
        task.userSessions[userSessionIndex].startedAt = new Date();
      }

      // ✅ Add user to startedUsers array
      if (!task.startedUsers) {
        task.startedUsers = [];
      }

      if (!task.startedUsers.includes(userId)) {
        task.startedUsers.push(userId);
      }

      task.markModified("userSessions");
      task.markModified("startedUsers");

      const updatedTask = await task.save({ session });

      const submission = new Submission({
        task: taskId,
        user: userId,
        startedAt: new Date(),
        status: "in-progress",
        totalQuestions: task.questions ? task.questions.length : 0,
        currentQuestionIndex: 0,
        answers: []
      });

      await submission.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        success: true,
        message: "Quiz started successfully",
        task: updatedTask,
        submission
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

  } catch (error) {
    console.error("Error in startQuiz:", error);
    res.status(500).json({
      success: false,
      message: "Error starting quiz",
      error: error.message
    });
  }
};
/**
 * @description Check if a task should be auto-submitted due to time limit
 * 
 * @route GET /tasks/:taskId/time-check
 * @access Private (User)
 */
const checkQuizTimeLimit = async (req, res) => {
  const { taskId } = req.params;
  const userId = req.user.id;

  try {
    // Validate inputs
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: "Invalid Task ID format" });
    }

    // Find the task
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check if the task is in in-progress status
    if (task.status !== "in-progress") {
      return res.status(200).json({ 
        success: true, 
        message: `Task is in ${task.status} status`,
        shouldAutoSubmit: false,
        timeRemaining: null
      });
    }

    // Find the user session
    const userSession = task.userSessions ? 
      task.userSessions.find(session => session.user.toString() === userId) : null;

    if (!userSession || !userSession.startedAt) {
      return res.status(200).json({ 
        success: true, 
        message: "No active session found for this user",
        shouldAutoSubmit: false,
        timeRemaining: null
      });
    }

    // Check if the quiz has already been completed
    if (userSession.completed) {
      return res.status(200).json({ 
        success: true, 
        message: "Quiz has already been submitted",
        shouldAutoSubmit: false,
        timeRemaining: null
      });
    }

    // Calculate time elapsed
    const startTime = new Date(userSession.startedAt);
    const currentTime = new Date();
    const timeElapsedMinutes = (currentTime - startTime) / (1000 * 60);
    const timeRemainingMinutes = task.timeLimit - timeElapsedMinutes;

    // Check if time limit exceeded
    if (timeElapsedMinutes > task.timeLimit) {
      return res.status(200).json({ 
        success: true, 
        message: "Time limit exceeded",
        shouldAutoSubmit: true,
        timeRemaining: 0
      });
    }

    res.status(200).json({
      success: true,
      message: "Quiz in progress",
      shouldAutoSubmit: false,
      timeRemaining: timeRemainingMinutes,
      timeRemainingFormatted: `${Math.floor(timeRemainingMinutes)}:${Math.floor((timeRemainingMinutes % 1) * 60).toString().padStart(2, '0')}`
    });
  } catch (error) {
    console.error("Error in checkQuizTimeLimit:", error);
    res.status(500).json({
      success: false,
      message: "Error checking quiz time limit",
      error: error.message
    });
  }
};

module.exports = {
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  getMyTasks,
  startQuiz,
  checkQuizTimeLimit
};