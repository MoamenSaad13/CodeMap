const mongoose = require("mongoose");
const Lesson = require("../models/Lesson");
const Category = require("../models/Category");
const User = require("../models/User");
const Task = require("../models/Tasks");
const QuestionPool = require("../models/QuestionPool");
const Notification = require("../models/Notification");
const Stage = require("../models/Stage");
const Roadmap = require("../models/Roadmap");

/**
 
@description Check if all lessons in a category are completed by a user.,
@param {String} userId - The ID of the user.,
@param {String} categoryId - The ID of the category to check.,
@returns {Promise<Object>} - Returns an object with the result of the completion check.*/

const checkCategoryCompletion = async (userId, categoryId, session = null) => { // Add session parameter
  try {
    // Find the category and populate its lessons
    const categoryQuery = Category.findById(categoryId).populate("lesson");
    if (session) {
        categoryQuery.session(session); // Use session if provided
    }
    const category = await categoryQuery;

    if (!category) {
      return { success: false, message: "Category not found" };
    }

    // Get all lessons in the category
    const lessonsInCategory = category.lesson;
    if (!lessonsInCategory || lessonsInCategory.length === 0) {
      return { success: false, message: "No lessons found in this category" };
    }

    // Get the lesson IDs in the category
    const lessonIds = lessonsInCategory.map(lesson => lesson._id);

    // Check if the user has completed all lessons in the category
    // Note: We check the Lesson model's completedby field, which is updated in the transaction
    const completedLessonsQuery = Lesson.find({
      _id: { $in: lessonIds },
      completedby: { $in: [userId] } // Check if userId is in the completedby array
    });
    if (session) {
        completedLessonsQuery.session(session); // Use session if provided
    }
    const completedLessons = await completedLessonsQuery;

    // Check if the number of completed lessons matches the total number of lessons in the category
    const isCompleted = completedLessons.length === lessonIds.length;

    return {
      success: true,
      isCompleted,
      completedCount: completedLessons.length,
      totalCount: lessonIds.length
    };
  } catch (error) {
    console.error("Error in checkCategoryCompletion:", error);
    return {
      success: false,
      message: "Error checking category completion",
      error: error.message
    };
  }
};

/**
 * @description Generate a task from question pool when all lessons in a category are completed
 * @param {String} userId    - The ID of the user
 * @param {String} categoryId - The ID of the category
 * @returns {Promise<Object>} - Returns { success, task } or { success: false, message }
 */
const generateTaskFromQuestionPool = async (userId, categoryId, session) => { // Add session parameter
  try {
    console.log("Generating task for user:", userId, "category:", categoryId, "using session");

    // 1) Find any active question pools for this category
    const questionPools = await QuestionPool.find({
      category: categoryId,
      isActive: true,
    }).session(session); // Use session

    if (!questionPools || questionPools.length === 0) {
      console.log("No active question pools found for this category:", categoryId);
      return {
        success: false,
        message: "No active question pools found for this category",
      };
    }

    // 2) Load the Category itself (so we know how many questions to pull, etc.)
    const category = await Category.findById(categoryId).session(session); // Use session
    if (!category) {
      console.log("Category not found for id:", categoryId);
      return { success: false, message: "Category not found." };
    }
//    const existingTask = await Task.findOne({
//   user: userId,
//   category: categoryId
// }).session(session);

// if (existingTask) {
//   console.log("Task wrongly detected as existing:");
//   console.log("User:", existingTask.user);
//   console.log("Expected User:", userId);
//   return {
//     success: false,
//     message: "User already has a task for this category",
//   };
// }

// 4) Determine how many questions to include
const questionCount = category.quizQuestionCount || 10;

    // 5) Pick one QuestionPool ID (e.g. the first active one)
    // Ensure category.questionpool is populated if needed, or handle potential issues
    const questionpoolId = Array.isArray(category.questionpool)
      ? category.questionpool[0]
      : category.questionpool;

    if (!questionpoolId) {
        console.log("Question pool ID not found on category:", categoryId);
        return { success: false, message: "Category does not have an associated question pool." };
    }

    // 6) Aggregate ALL multiple-choice questions from every active pool
    let allQuestions = [];
    questionPools.forEach((pool) => {
      const mcq = pool.questions.filter((q) => q.questionType === "multiple_choice");
      allQuestions = allQuestions.concat(mcq);
    });

    if (allQuestions.length < questionCount) {
      console.log(
        `Not enough multiple-choice questions. Found ${allQuestions.length}, but need ${questionCount}`
      );
      return {
        success: false,
        message: `Not enough multiple-choice questions. Found ${allQuestions.length}, but need ${questionCount}`,
      };
    }

    // 7) Randomly pick exactly “questionCount” questions
    const selectedQuestions = [];
    while (selectedQuestions.length < questionCount) {
      const randIdx = Math.floor(Math.random() * allQuestions.length);
      const pick = allQuestions[randIdx];
      // Ensure unique questions based on _id
      if (!selectedQuestions.find((q) => q._id.toString() === pick._id.toString())) {
        selectedQuestions.push(pick);
      }
    }

    // 8) Compute total points
    const totalPoints = selectedQuestions.reduce(
      (sum, q) => sum + (q.points || 1),
      0
    );

    // 9) Create the Task (but don't save yet, just prepare the object)
const newTaskData = {
  title: `${category.title} Assessment`,
  description: `Assessment for ${category.title} category`,
  status: "pending",
  instructions:
    "Complete all questions within the time limit. You can navigate back and forth between questions.",
 questions: selectedQuestions.map(q => ({
  _id: q._id,
  questionText: q.questionText,
  questionType: q.questionType,
  options: q.options, // must contain option._id
  correctAnswers: q.options
    .filter(opt => q.correctAnswers.includes(opt.id)) // "q13opt4" etc.
    .map(opt => opt._id), // convert to ObjectId
  points: q.points
})),
  totalPoints: totalPoints,
  category: categoryId,
  user: userId,
  questionpool: questionpoolId,
  isRandomized: true,
  timeLimit: 60,
  requireAllLessonsCompleted: true,
};

    // Save the new task using the session
    const newTask = new Task(newTaskData);
    const savedTask = await newTask.save({ session: session }); // Use session

    console.log("Task generated:", savedTask._id);

    // 10) Push the Task reference onto User, Category, and QuestionPool using the session
    await User.findByIdAndUpdate(userId, 
        { $addToSet: { task: savedTask._id } }, 
        { session: session } // Use session
    );
    await Category.findByIdAndUpdate(categoryId, 
        { $addToSet: { task: savedTask._id } }, 
        { session: session } // Use session
    );
    await QuestionPool.findByIdAndUpdate(questionpoolId, 
        { $addToSet: { tasks: savedTask._id } }, // Corrected field name to 'tasks' (plural)
        { session: session } // Use session
    );

    console.log("Associated models updated with task reference.");

    return {
      success: true,
      task: savedTask, // Return the saved task object
    };
  } catch (error) {
    console.error("Error in generateTaskFromQuestionPool:", error);
    // Do not abort transaction here, let the caller handle it
    return { success: false, message: error.message };
  }
};

const markLessonAsCompleted = async (req, res) => {
  const lessonId = req.params.id;
  const userId = req.user.id; // from auth middleware

  console.log("Marking lesson as completed:", lessonId, userId);

  const session = await mongoose.startSession();
  session.startTransaction();
  let taskGenerated = false; // Flag to track task generation
  let responseSent = false; // Flag to prevent double response

  try {
    // --- Initial Validations (Abort transaction and return early if invalid) ---
    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      console.log("Invalid lesson ID:", lessonId);
      await session.abortTransaction();
      session.endSession();
      responseSent = true;
      return res.status(400).json({ message: "Invalid Lesson ID" });
    }
    const currentLesson = await Lesson.findById(lessonId).session(session);
    if (!currentLesson) {
      console.log("Lesson not found for id:", lessonId);
      await session.abortTransaction();
      session.endSession();
      responseSent = true;
      return res.status(404).json({ message: "Lesson not found" });
    }
    const user = await User.findById(userId).session(session);
    if (!user) {
      console.log("User not found for id:", userId);
      await session.abortTransaction();
      session.endSession();
      responseSent = true;
      return res.status(404).json({ message: "User not found" });
    }
    // 🚫 Check if user is enrolled in the roadmap
if (!user.roadmap.includes(currentLesson.roadmap.toString())) {
  console.log(`User ${userId} is not enrolled in roadmap ${currentLesson.roadmap}`);
  await session.abortTransaction();
  session.endSession();
  responseSent = true;
  return res.status(403).json({
    message: "You must be enrolled in this roadmap to complete its lessons."
  });
}
    if (user.completedlesson.includes(lessonId)) {
      console.log("Lesson already marked as completed:", lessonId);
      await session.abortTransaction();
      session.endSession();
      responseSent = true;
      return res.status(400).json({ message: "Lesson already marked as completed" });
    }

    // --- New Prerequisite Checks ---
    const currentLessonCategory = await Category.findById(currentLesson.category).session(session);
    const currentLessonStage = await Stage.findById(currentLesson.stage).session(session);
    const currentLessonRoadmap = await Roadmap.findById(currentLesson.roadmap).session(session);

    if (!currentLessonCategory || !currentLessonStage || !currentLessonRoadmap) {
        await session.abortTransaction();
        session.endSession();
        responseSent = true;
        return res.status(500).json({ message: "Could not retrieve full lesson hierarchy." });
    }

    // 1. Check Previous Stage Completion
    const allStagesInRoadmap = await Stage.find({ roadmap: currentLessonRoadmap._id }).sort({ order: 1 }).session(session);
    const currentStageIndex = allStagesInRoadmap.findIndex(s => s._id.equals(currentLessonStage._id));

    for (let i = 0; i < currentStageIndex; i++) {
        const prevStage = allStagesInRoadmap[i];
        const categoriesInPrevStage = await Category.find({ stage: prevStage._id }).populate('lesson').session(session);
        for (const category of categoriesInPrevStage) {
            for (const lesson of category.lesson) {
                if (!user.completedlesson.includes(lesson._id)) {
                    await session.abortTransaction();
                    session.endSession();
                    responseSent = true;
                    return res.status(403).json({ message: `Please complete all lessons in previous stages first. Lesson: ${lesson.title} in Stage: ${prevStage.title}` });
                }
            }
        }
    }

    // 2. Check Previous Category Completion within Current Stage
    const allCategoriesInCurrentStage = await Category.find({ stage: currentLessonStage._id }).populate('lesson').session(session);
    const currentCategoryIndex = allCategoriesInCurrentStage.findIndex(c => c._id.equals(currentLessonCategory._id));

    for (let i = 0; i < currentCategoryIndex; i++) {
        const prevCategory = allCategoriesInCurrentStage[i];
        for (const lesson of prevCategory.lesson) {
            if (!user.completedlesson.includes(lesson._id)) {
                await session.abortTransaction();
                session.endSession();
                responseSent = true;
                return res.status(403).json({ message: `Please complete all lessons in previous categories within this stage first. Lesson: ${lesson.title} in Category: ${prevCategory.title}` });
            }
        }
    }

    // 3. Check Previous Lesson Completion within Current Category
    const allLessonsInCurrentCategory = await Lesson.find({ category: currentLessonCategory._id }).session(session);
    const currentLessonIndex = allLessonsInCurrentCategory.findIndex(l => l._id.equals(lessonId));

    if (currentLessonIndex > 0) {
        const prevLesson = allLessonsInCurrentCategory[currentLessonIndex - 1];
        if (!user.completedlesson.includes(prevLesson._id)) {
            await session.abortTransaction();
            session.endSession();
            responseSent = true;
            return res.status(403).json({ message: `Please complete the previous lesson in this category first. Lesson: ${prevLesson.title}` });
        }
    }

    // --- Mark Lesson as Completed ---
    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { completedlesson: lessonId } },
      { session }
    );
    await Lesson.findByIdAndUpdate(
      lessonId,
      { $addToSet: { completedby: userId } },
      { session }
    );
    console.log("Lesson marked as completed in DB (within transaction).");

    // --- Check Category Completion and Generate Task if Needed ---
    const checkResult = await checkCategoryCompletion(userId, currentLesson.category, session);
    console.log("Check result for category completion:", checkResult);

    if (checkResult.success && checkResult.isCompleted) {
      console.log("Category completed, attempting to generate task...");
      const genResult = await generateTaskFromQuestionPool(userId, currentLesson.category, session);

      if (genResult.success) {
        console.log("Task generation successful.");
        taskGenerated = true;
        // Commit transaction and send success response with task
        await session.commitTransaction();
        console.log("Transaction committed successfully (with task).");
        session.endSession();
        responseSent = true;
        return res.status(200).json({
          message: "Lesson marked completed. Category finished, new assessment generated.",
          taskGenerated: true,
          task: genResult.task,
        });
      } else {
        // Task generation failed, abort transaction and send error response
        console.error("Task generation failed:", genResult.message);
        await session.abortTransaction();
        console.log("Transaction aborted due to task generation failure.");
        session.endSession();
        responseSent = true;
        return res.status(500).json({
          message: "Lesson marked completed, but failed to generate the category assessment task.",
          error: genResult.message,
          taskGenerated: false,
        });
      }
    } else if (!checkResult.success) {
        // Handle error during category completion check
        console.error("Failed to check category completion:", checkResult.message);
        await session.abortTransaction();
        console.log("Transaction aborted due to category check failure.");
        session.endSession();
        responseSent = true;
        return res.status(500).json({
            message: "Error checking category completion status.",
            error: checkResult.message,
            taskGenerated: false,
        });
    }

    // --- If Category Not Completed Yet --- 
    // Commit transaction and send success response (no task generated)
    console.log("Category not yet completed.");
    await session.commitTransaction();
    console.log("Transaction committed successfully (no task generated).");
    session.endSession();
    responseSent = true;
    return res.status(200).json({
      message: "Lesson marked as completed successfully.",
      taskGenerated: false,
    });

  } catch (err) {
    console.error("Error in markLessonAsCompleted function:", err);
    // Abort transaction only if it's still active and response hasn't been sent
    if (session.inTransaction() && !responseSent) {
      try {
        await session.abortTransaction();
        console.log("Transaction aborted due to error.");
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }
    // Ensure response is sent if not already
    if (!responseSent) {
        session.endSession(); // End session if not already ended
        return res.status(500).json({
          message: "Server error marking lesson as completed",
          error: err.message,
          taskGenerated: false, // Ensure this is set
        });
    }
    // If response was already sent, just end the session if it's still active
    else if (session && session.id) { // Check if session exists
        try {
            // Attempt to end session if not already ended by commit/abort paths
            session.endSession();
        } catch (endSessionError) {
            // Ignore errors if session was already ended
        }
    }
  }
};
 /**
  * @description Get all lessons
  * @route GET /lessons
  * @access Private
  */
const getAllLessons = async (req, res) => {
  try {
    const lessons = await Lesson.find()
      .populate("category", "title")
      .populate("roadmap", "title")
      .populate("stage", "title")
      .sort({ createdAt: -1 })
      .lean();

    res.json(lessons);
  } catch (error) {
    console.error("Error getting lessons:", error);
    res.status(500).json({
      message: "Server error getting lessons",
      error: error.message,
    });
  }
};

/**
 * @description Get a lesson by ID
 * @route GET /lessons/:id
 * @access Private
 */
const getLessonById = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Lesson ID." });
  }

  try {
    const lesson = await Lesson.findById(id)
      .populate("category", "title")
      .populate("roadmap", "title")
      .populate("stage", "title")
      .lean();

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found." });
    }

    res.json(lesson);
  } catch (error) {
    console.error("Error getting lesson:", error);
    res.status(500).json({
      message: "Server error getting lesson",
      error: error.message,
    });
  }
};

// Create a new lesson
const createLesson = async (req, res) => {
  const {
    title,
    description,
    link,
    category: categoryId,
    lesson_duration,
  } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Validate categoryId
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid Category ID." });
    }

    const existingCategory =
      await Category.findById(categoryId).session(session);
    if (!existingCategory) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Category not found." });
    }

    const stageId = existingCategory.stage;
    const roadmapId = existingCategory.roadmap;

    // Validate stage and roadmap references found in category
    if (!stageId || !roadmapId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "Category is missing stage or roadmap reference." });
    }

    // Calculate the next lecture_number for the category (within transaction)
    // Note: This count might not be perfectly atomic without locking, but likely sufficient.
    const lessonCountInCategory = await Lesson.countDocuments({
      category: categoryId,
    }).session(session);
    const lecture_number = lessonCountInCategory + 1;

    const newLesson = new Lesson({
      title,
      description,
      link,
      category: categoryId,
      lesson_duration,
      stage: stageId,
      roadmap: roadmapId,
      lecture_number,
    });

    const savedLesson = await newLesson.save({ session });

    // Add lesson reference to category, stage, and roadmap
    await Category.findByIdAndUpdate(
      categoryId,
      { $addToSet: { lesson: savedLesson._id } },
      { session }
    );
    await Stage.findByIdAndUpdate(
      stageId,
      { $addToSet: { lesson: savedLesson._id } },
      { session }
    );
    await Roadmap.findByIdAndUpdate(
      roadmapId,
      { $addToSet: { lesson: savedLesson._id } },
      { session }
    );

    // --- Add new lesson reference to all users enrolled in the roadmap ---
    await User.updateMany(
      { roadmap: roadmapId }, // Find users enrolled in this roadmap
      { $addToSet: { lesson: savedLesson._id } }, // Add the new lesson ID to their 'lesson' array
      { session } // Perform within the transaction
    );
    // --- End of user update ---

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(savedLesson);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating lesson:", error);
    res
      .status(500)
      .json({ message: "Server error creating lesson", error: error.message });
  }
};

/**
 * @description Update a lesson
 * @route PUT /lessons/:id
 * @access Private (Admin only)
 */
const updateLesson = async (req, res) => {
  // Ensure only admins can update lessons
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin role required" });
  }

  const { id } = req.params;
  const updateData = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Lesson ID." });
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
    // Get the current lesson to check for reference changes
    const currentLesson = await Lesson.findById(id).session(session);
    if (!currentLesson) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Lesson not found." });
    }

    // Handle category change if it's changed
    if (
      updateData.category &&
      mongoose.Types.ObjectId.isValid(updateData.category) &&
      updateData.category !== currentLesson.category.toString()
    ) {
      // Remove lesson reference from old category
      await Category.findByIdAndUpdate(
        currentLesson.category,
        { $pull: { lesson: id } },
        { session }
      );

      // Add lesson reference to new category
      await Category.findByIdAndUpdate(
        updateData.category,
        { $push: { lesson: id } },
        { session }
      );
    }

    // Handle roadmap change if it's changed
    if (
      updateData.roadmap &&
      mongoose.Types.ObjectId.isValid(updateData.roadmap) &&
      updateData.roadmap !== currentLesson.roadmap.toString()
    ) {
      // Remove lesson reference from old roadmap
      await mongoose.model("Roadmap").findByIdAndUpdate(
        currentLesson.roadmap,
        { $pull: { lesson: id } },
        { session }
      );

      // Add lesson reference to new roadmap
      await mongoose.model("Roadmap").findByIdAndUpdate(
        updateData.roadmap,
        { $push: { lesson: id } },
        { session }
      );
    }

    // Handle stage change if it's changed
    if (
      updateData.stage &&
      mongoose.Types.ObjectId.isValid(updateData.stage) &&
      updateData.stage !== currentLesson.stage.toString()
    ) {
      // Remove lesson reference from old stage
      await mongoose.model("Stage").findByIdAndUpdate(
        currentLesson.stage,
        { $pull: { lesson: id } },
        { session }
      );

      // Add lesson reference to new stage
      await mongoose.model("Stage").findByIdAndUpdate(
        updateData.stage,
        { $push: { lesson: id } },
        { session }
      );
    }

    // Update the lesson
    const updatedLesson = await Lesson.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Lesson updated successfully",
      lesson: updatedLesson,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating lesson:", error);
    res.status(500).json({
      message: "Server error updating lesson",
      error: error.message,
    });
  }
};

/**
 * @description Delete a lesson
 * @route DELETE /lessons/:id
 * @access Private (Admin only)
 */
const deleteLesson = async (req, res) => {
  // Ensure only admins can delete lessons
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin role required" });
  }

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Lesson ID." });
  }

  try {
    // Use findOneAndDelete to trigger the pre-hook for cascading deletes
    const deletedLesson = await Lesson.findOneAndDelete({ _id: id });

    if (!deletedLesson) {
      return res.status(404).json({ message: "Lesson not found." });
    }

    res.json({
      message: "Lesson deleted successfully",
      lesson: deletedLesson,
    });
  } catch (error) {
    console.error("Error deleting lesson:", error);
    res.status(500).json({
      message: "Server error deleting lesson",
      error: error.message,
    });
  }
};
/**
 * @description Get all lessons completed by the authenticated user
 * @route GET /lessons/completed
 * @access Private
 */
const getCompletedLessons = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId)
      .populate({
        path: "completedlesson",
        populate: [
          { path: "category", select: "title" },
          { path: "roadmap", select: "title" },
          { path: "stage", select: "title" },
        ],
      })
      .select("completedlesson")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json(user.completedlesson || []);
  } catch (error) {
    console.error("Error getting completed lessons:", error);
    res.status(500).json({
      message: "Server error getting completed lessons",
      error: error.message,
    });
  }
};

/**
 * @description Get all lessons by category
 * @route GET /lessons/category/:categoryId
 * @access Private
 */
const getLessonsByCategory = async (req, res) => {
  const { categoryId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return res.status(400).json({ message: "Invalid Category ID." });
  }

  try {
    const lessons = await Lesson.find({ category: categoryId })
      .populate("category", "title")
      .populate("roadmap", "title")
      .populate("stage", "title")
      .sort({ createdAt: -1 })
      .lean();

    res.json(lessons);
  } catch (error) {
    console.error("Error getting lessons by category:", error);
    res.status(500).json({
      message: "Server error getting lessons",
      error: error.message,
    });
  }
};

/**
 * @description Get all lessons by roadmap
 * @route GET /lessons/roadmap/:roadmapId
 * @access Private
 */
const getLessonsByRoadmap = async (req, res) => {
  const { roadmapId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(roadmapId)) {
    return res.status(400).json({ message: "Invalid Roadmap ID." });
  }

  try {
    const lessons = await Lesson.find({ roadmap: roadmapId })
      .populate("category", "title")
      .populate("roadmap", "title")
      .populate("stage", "title")
      .sort({ createdAt: -1 })
      .lean();

    res.json(lessons);
  } catch (error) {
    console.error("Error getting lessons by roadmap:", error);
    res.status(500).json({
      message: "Server error getting lessons",
      error: error.message,
    });
  }
};

/**
 * @description Get all lessons by stage
 * @route GET /lessons/stage/:stageId
 * @access Private
 */
const getLessonsByStage = async (req, res) => {
  const { stageId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(stageId)) {
    return res.status(400).json({ message: "Invalid Stage ID." });
  }

  try {
    const lessons = await Lesson.find({ stage: stageId })
      .populate("category", "title")
      .populate("roadmap", "title")
      .populate("stage", "title")
      .sort({ createdAt: -1 })
      .lean();

    res.json(lessons);
  } catch (error) {
    console.error("Error getting lessons by stage:", error);
    res.status(500).json({
      message: "Server error getting lessons",
      error: error.message,
    });
  }
};
/**
 * Check if a lesson is available for a user to take
 * @route GET /lessons/available/:id
 * @access Private
 */
const checkLessonAvailability = async (req, res) => {
  const lessonId = req.params.id;
  const userId = req.user.id;
  
  try {
    // Validate lesson ID
    if (!mongoose.Types.ObjectId.isValid(lessonId)) {
      return res.status(400).json({ message: "Invalid Lesson ID" });
    }
    
    // Get the lesson
    const currentLesson = await Lesson.findById(lessonId);
    if (!currentLesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }
    
    // Get the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Get the current lesson's category, stage, and roadmap
    const categoryId = currentLesson.category;
    const stageId = currentLesson.stage;
    const roadmapId = currentLesson.roadmap;
    const currentLectureNumber = currentLesson.lecture_number;
    
    // Check if lesson is already completed
    const isCompleted = user.completedlesson.includes(lessonId);
    
    // Initialize response object
    const response = {
      lessonId,
      isCompleted,
      isAvailable: true,
      reason: null
    };
    
    // If already completed, it's available
    if (isCompleted) {
      return res.status(200).json(response);
    }
    
    // 1. Check if all previous lessons in the same category are completed
    const previousLessonsInCategory = await Lesson.find({
      category: categoryId,
      lecture_number: { $lt: currentLectureNumber }
    });
    
    for (const prevLesson of previousLessonsInCategory) {
      if (!user.completedlesson.includes(prevLesson._id)) {
        response.isAvailable = false;
        response.reason = "previous_lessons_incomplete";
        response.incompleteLesson = prevLesson;
        response.message = "Complete all previous lessons in this category first.";
        return res.status(200).json(response);
      }
    }
    
    // 2. Get all categories in the current stage in order
    const categoriesInStage = await Category.find({ stage: stageId })
      .sort({ createdAt: 1 }); // Assuming categories are ordered by creation date
    
    // Find the index of the current category
    const currentCategoryIndex = categoriesInStage.findIndex(
      cat => cat._id.toString() === categoryId.toString()
    );
    
    // Check if all lessons in previous categories are completed
    for (let i = 0; i < currentCategoryIndex; i++) {
      const prevCategoryId = categoriesInStage[i]._id;
      
      // Get all lessons in this previous category
      const lessonsInPrevCategory = await Lesson.find({
        category: prevCategoryId
      });
      
      // Check if all lessons in this previous category are completed
      for (const lesson of lessonsInPrevCategory) {
        if (!user.completedlesson.includes(lesson._id)) {
          response.isAvailable = false;
          response.reason = "previous_category_incomplete";
          response.incompleteLesson = lesson;
          response.incompleteCategory = categoriesInStage[i];
          response.message = "Complete all lessons in previous categories first.";
          return res.status(200).json(response);
        }
      }
    }
    
    // 3. Get all stages in the roadmap in order
    const stagesInRoadmap = await Stage.find({ roadmap: roadmapId })
      .sort({ createdAt: 1 }); // Assuming stages are ordered by creation date
    
    // Find the index of the current stage
    const currentStageIndex = stagesInRoadmap.findIndex(
      s => s._id.toString() === stageId.toString()
    );
    
    // Check if all lessons in previous stages are completed
    for (let i = 0; i < currentStageIndex; i++) {
      const prevStageId = stagesInRoadmap[i]._id;
      
      // Get all lessons in this previous stage
      const lessonsInPrevStage = await Lesson.find({
        stage: prevStageId
      });
      
      // Check if all lessons in this previous stage are completed
      for (const lesson of lessonsInPrevStage) {
        if (!user.completedlesson.includes(lesson._id)) {
          response.isAvailable = false;
          response.reason = "previous_stage_incomplete";
          response.incompleteLesson = lesson;
          response.incompleteStage = stagesInRoadmap[i];
          response.message = "Complete all lessons in previous stages first.";
          return res.status(200).json(response);
        }
      }
    }
    
    // If we got here, the lesson is available
    response.message = "Lesson is available to take";
    return res.status(200).json(response);
    
  } catch (error) {
    console.error("Error checking lesson availability:", error);
    res.status(500).json({
      message: "Server error checking lesson availability",
      error: error.message
    });
  }
};

module.exports = {
  getAllLessons,
  getLessonById,
  createLesson,
  updateLesson,
  deleteLesson,
  markLessonAsCompleted,
  getLessonsByCategory,
  getLessonsByRoadmap,
  getLessonsByStage,
  getCompletedLessons,
  checkCategoryCompletion,
  generateTaskFromQuestionPool,
  checkLessonAvailability
};
