const mongoose = require("mongoose");
const Submission = require("../models/Submission");
const Task = require("../models/Tasks");
const User = require("../models/User");
const Notification = require("../models/Notification");
const NotificationService = require("../services/notificationService"); // Import NotificationService

/**
 * @description Get a specific submission by its ID.
 * @route GET /submissions/:submissionId
 * @access Private (User viewing their own, or Admin viewing any)
 */
const getSubmissionById = async (req, res) => {
  const { submissionId } = req.params;
  const requestingUserId = req.user.id;
  const requestingUserRole = req.user.role;

  if (!mongoose.Types.ObjectId.isValid(submissionId)) {
    return res.status(400).json({ message: "Invalid Submission ID." });
  }

  try {
    const submission = await Submission.findById(submissionId)
      .populate("task", "title description taskType options correctAnswers allowMultipleAnswers") // Populate task details
      .populate("user", "first_name last_name email") // Populate user details
      .lean();

    if (!submission) {
      return res.status(404).json({ message: "Submission not found." });
    }

    // Authorization check: Allow admin or the user who made the submission
    if (
      requestingUserRole !== "admin" &&
      submission.user._id.toString() !== requestingUserId
    ) {
      return res.status(403).json({
        message: "Forbidden: You are not authorized to view this submission.",
      });
    }

    res.json(submission);
  } catch (error) {
    console.error("Error getting submission by ID:", error);
    res.status(500).json({
      message: "Server error getting submission.",
      error: error.message,
    });
  }
};

/**
 * @description Get all submissions for a specific task.
 * @route GET /submissions/task/:taskId
 * @access Private (Admin only)
 */
const getSubmissionsForTask = async (req, res) => {
  const { taskId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    return res.status(400).json({ message: "Invalid Task ID." });
  }

  try {
    // Check if task exists (optional, but good practice)
    const taskExists = await Task.findById(taskId).select("_id").lean();
    if (!taskExists) {
      return res.status(404).json({ message: "Task not found." });
    }

    const submissions = await Submission.find({ task: taskId })
      .populate("user", "first_name last_name email") // Populate user details
      .sort({ createdAt: -1 }) // Sort by submission date, newest first
      .lean();

    // No need for 404 if empty, an empty array is valid
    res.json(submissions);
  } catch (error) {
    console.error("Error getting submissions for task:", error);
    res.status(500).json({
      message: "Server error getting submissions.",
      error: error.message,
    });
  }
};

/**
 * @description Get all submissions made by the authenticated user.
 * @route GET /submissions/my-submissions
 * @access Private (User getting their own)
 */
const getMySubmissions = async (req, res) => {
  const userId = req.user.id;

  try {
    const submissions = await Submission.find({ user: userId })
      .populate("task", "title description taskType") // Populate task details
      .sort({ createdAt: -1 }) // Sort by submission date, newest first
      .lean();

    // No need for 404 if empty, an empty array is valid
    res.json(submissions);
  } catch (error) {
    console.error("Error getting user submissions:", error);
    res.status(500).json({
      message: "Server error getting submissions.",
      error: error.message,
    });
  }
};

/**
 * @description Submit quiz answers and calculate score
 * @route POST /submissions/:taskId/submit-quiz
 * @access Private (User)
 */
const submitQuiz = async (req, res) => {
  const { taskId } = req.params;
  const { answers } = req.body;
  const userId = req.user.id;

  try {
    // Validate inputs
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: "Invalid Task ID format" });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({ message: "Answers must be an array" });
    }

    // Find the task
    const task = await Task.findById(taskId).populate('category');
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Check if the task is assigned to the user
   if (task.user.toString() !== userId) {
  return res.status(403).json({ message: "Task not assigned to this user" });
}

    // Find existing submission or create new one
    let submission = await Submission.findOne({ 
      task: taskId, 
      user: userId 
    });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // If no submission exists, create one
      if (!submission) {
        submission = new Submission({
          task: taskId,
          user: userId,
          startedAt: new Date(),
          status: "in-progress",
          totalQuestions: task.questions ? task.questions.length : 0,
          answers: []
        });
      }

      // Check if the submission is already locked
      if (submission.isLocked) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "This submission is already finalized and cannot be modified" });
      }

      // Check if the time limit has been exceeded
      if (submission.startedAt) {
        const startTime = new Date(submission.startedAt).getTime();
        const currentTime = new Date().getTime();
        const timeElapsedMinutes = (currentTime - startTime) / (1000 * 60);

        if (timeElapsedMinutes > task.timeLimit) {
          submission.status = "expired";
          submission.isLocked = true;
          submission.completedAt = new Date();
          submission.timeSpent = task.timeLimit * 60; // Max time in seconds
          
          await submission.save({ session });
          
          // Update task status
          task.status = "completed";
          const userSessionIndex = task.userSessions ? 
            task.userSessions.findIndex(session => session.user.toString() === userId) : -1;
          
          if (userSessionIndex !== -1) {
            task.userSessions[userSessionIndex].completed = true;
          }
          
          await task.save({ session });
          
          await session.commitTransaction();
          session.endSession();
          
          return res.status(400).json({
            message: "Time limit exceeded. Quiz has been auto-submitted.",
            submission: submission
          });
        }
      }

      // Process answers
      const questionMap = new Map();
      
      // Create a map of questions by questionId for easy lookup
      task.questions.forEach(question => {
        questionMap.set(question.questionId, question);
      });

      // Update answers in submission
     answers.forEach(answer => {
  const existingIndex = submission.answers.findIndex(
    a => a.questionId.toString() === answer.questionId
  );

  if (existingIndex !== -1) {
    // Update existing answer
    submission.answers[existingIndex].selectedOptions = answer.selectedOptionIds;
  } else {
    // Add new answer
    submission.answers.push({
      questionId: answer.questionId,
      selectedOptions: answer.selectedOptionIds
    });
  }
});

      // Calculate score
      let correctCount = 0;
const totalQuestions = task.questions.length;

for (const question of task.questions) {
  const answer = submission.answers.find(a =>
    a.questionId.toString() === question._id.toString()
  );

  if (answer) {
    // 🔥 FIX: Normalize both correct and submitted answers to strings
    const correctAnswers = (question.correctAnswers || []).map(String);
    const userAnswers = (answer.selectedOptions || []).map(String);

    if (!question.allowMultipleAnswers) {
      if (userAnswers.length === 1 && correctAnswers.includes(userAnswers[0])) {
        correctCount++;
      }
    } else {
      const allCorrectSelected = correctAnswers.every(opt => userAnswers.includes(opt));
      const noIncorrectSelected = userAnswers.every(opt => correctAnswers.includes(opt));
      if (allCorrectSelected && noIncorrectSelected) {
        correctCount++;
      }
    }
  }
}
      // Update submission
      submission.status = "graded";
      submission.isLocked = true;
      submission.completedAt = new Date();
      submission.score = correctCount;
      submission.correctAnswers = correctCount;
      submission.totalQuestions = totalQuestions;
      submission.percentageScore = totalQuestions > 0 ? 
        Math.round((correctCount / totalQuestions) * 100) : 0;
      submission.gradedAt = new Date();
      
      // Calculate time spent
      if (submission.startedAt) {
        const startTime = new Date(submission.startedAt).getTime();
        const endTime = new Date().getTime();
        submission.timeSpent = Math.floor((endTime - startTime) / 1000); // Time in seconds
      }

      await submission.save({ session });

      // Update task status
      task.status = "completed";
      const userSessionIndex = task.userSessions ? 
        task.userSessions.findIndex(session => session.user.toString() === userId) : -1;
      
      if (userSessionIndex !== -1) {
        task.userSessions[userSessionIndex].completed = true;
        task.userSessions[userSessionIndex].score = correctCount;
      }
      
      await task.save({ session });

      // --- Notification: User Successfully Submitting Task ---
      try {
        const user = await User.findById(userId);
        if (user) {
          await NotificationService.createNotification({
            type: "user_activity",
            title: "Task Submitted Successfully",
            message: `Great job ${user.first_name}! You have successfully submitted "${task.title}". Your score: ${submission.percentageScore}%. Your submission is now being reviewed.`,
            assignedTo: userId,
            relatedTask: taskId,
            relatedSubmission: submission._id,
            relatedCategory: task.category._id,
            actions: [
              {
                label: "View Submission",
                action: "view",
                url: `/submissions/${submission._id}`,
                style: "primary",
              },
              {
                label: "Continue Learning",
                action: "view",
                url: `/categories/${task.category._id}`,
                style: "secondary",
              },
            ],
            metadata: {
              submissionDate: new Date(),
              taskTitle: task.title,
              score: submission.score,
              percentageScore: submission.percentageScore,
              timeSpent: submission.timeSpent
            }
          });
          console.log(`Submission notification sent to user: ${user.email} for task: ${task.title}`);
        }
      } catch (notificationError) {
        console.error("Error sending submission notification:", notificationError);
      }
      // --- End Notification ---

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        success: true,
        message: "Quiz submitted successfully",
        score: correctCount,
        maxScore: totalQuestions,
        percentage: submission.percentageScore,
        submission: submission
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error("Error in submitQuiz:", error);
    res.status(500).json({
      success: false,
      message: "Error submitting quiz",
      error: error.message
    });
  }
};

/**
 * @description Grade a submission and provide feedback (Admin only)
 * @route PATCH /submissions/:submissionId/grade
 * @access Private (Admin only)
 */
const gradeSubmission = async (req, res) => {
  const { submissionId } = req.params;
  const { score, percentageScore, feedback } = req.body;
  const graderId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(submissionId)) {
    return res.status(400).json({ message: "Invalid Submission ID." });
  }

  try {
    // Update submission with grade and feedback
    const submission = await Submission.findByIdAndUpdate(
      submissionId,
      {
        score: score,
        percentageScore: percentageScore,
        feedback: feedback,
        status: "graded",
        gradedAt: new Date()
      },
      { new: true }
    ).populate('task user');
    
    if (!submission) {
      return res.status(404).json({ message: "Submission not found." });
    }

    // --- Notification: Grading and Feedback After Submission ---
    try {
      await NotificationService.createNotification({
        type: "grading",
        title: "Your Submission Has Been Graded",
        message: `Your submission for "${submission.task.title}" has been graded. Score: ${submission.percentageScore}%. ${submission.feedback ? 'Feedback has been provided.' : ''}`,
        assignedTo: submission.user._id,
        createdBy: graderId,
        relatedTask: submission.task._id,
        relatedSubmission: submission._id,
        actions: [
          {
            label: "View Results",
            action: "view",
            url: `/submissions/${submission._id}`,
            style: "primary",
          },
          {
            label: "View Feedback",
            action: "view",
            url: `/submissions/${submission._id}/feedback`,
            style: "secondary",
          },
        ],
        metadata: {
          gradedDate: new Date(),
          taskTitle: submission.task.title,
          finalScore: submission.score,
          percentageScore: submission.percentageScore,
          hasFeedback: !!submission.feedback
        }
      });
      console.log(`Grading notification sent to user: ${submission.user.email} for task: ${submission.task.title}`);
    } catch (notificationError) {
      console.error("Error sending grading notification:", notificationError);
    }
    // --- End Notification ---

    res.status(200).json({
      success: true,
      message: "Submission graded successfully",
      submission: submission
    });

  } catch (error) {
    console.error("Error grading submission:", error);
    res.status(500).json({
      success: false,
      message: "Error grading submission",
      error: error.message
    });
  }
};

module.exports = {
  getSubmissionById,
  getSubmissionsForTask,
  getMySubmissions,
  submitQuiz,
  gradeSubmission // Export the new function
};

