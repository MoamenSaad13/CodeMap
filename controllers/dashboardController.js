const mongoose = require("mongoose");
const User = require("../models/User");
const Roadmap = require("../models/Roadmap");
const Lesson = require("../models/Lesson");
const Task = require("../models/Tasks");
const Submission = require("../models/Submission");
const Category = require("../models/Category");

/**
 * @description Get dashboard data for the authenticated user.
 * @route GET /dashboard/user
 * @access Private (User getting their own)
 */
const getUserDashboardData = async (req, res) => {
  const userId = req.user.id;

  try {
    // Fetch user data with populated fields needed for dashboard
    const user = await User.findById(userId)
      .select("roadmap completedlesson task") // Select only necessary arrays
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // --- Calculate User Stats ---

    // 1. Enrolled Roadmaps Count
    const enrolledRoadmapsCount = user.roadmap?.length || 0;

    // 2. Completed Lessons Count
    const completedLessonsCount = user.completedlesson?.length || 0;

    // 3. Assigned Tasks Count (Total)
    const assignedTasksCount = user.task?.length || 0;

    // 4. Completed Tasks Count (Requires checking submissions or task status if updated)
    // Option A: Count tasks where user has a "graded" submission (assuming grade implies completion)
    const gradedSubmissions = await Submission.countDocuments({
      user: userId,
      status: "graded",
    });
    // Option B: If Task model had a user-specific status, query that.
    // For now, using graded submissions as proxy for completed tasks.
    const completedTasksCount = gradedSubmissions;

    // 5. Pending Tasks Count
    const pendingTasksCount = assignedTasksCount - completedTasksCount;

    // --- Prepare Response ---
    const dashboardData = {
      enrolledRoadmaps: enrolledRoadmapsCount,
      completedLessons: completedLessonsCount,
      assignedTasks: assignedTasksCount,
      completedTasks: completedTasksCount,
      pendingTasks: pendingTasksCount > 0 ? pendingTasksCount : 0, // Ensure non-negative
      // Add more stats as needed (e.g., progress percentage per roadmap)
    };

    res.json(dashboardData);
  } catch (error) {
    console.error("Error fetching user dashboard data:", error);
    res.status(500).json({
      message: "Server error fetching user dashboard data.",
      error: error.message,
    });
  }
};

/**
 * @description Get dashboard data for the admin.
 * @route GET /dashboard/admin
 * @access Private (Admin only)
 */
const getAdminDashboardData = async (req, res) => {
  try {
    // --- Calculate Admin Stats ---
    // Use Promise.all for parallel execution of independent counts
    const [
      totalUsers,
      totalRoadmaps,
      totalLessons,
      totalTasks,
      totalSubmissions,
      pendingSubmissions,
    ] = await Promise.all([
      User.countDocuments(),
      Roadmap.countDocuments(),
      Lesson.countDocuments(),
      Task.countDocuments(),
      Submission.countDocuments(),
      Submission.countDocuments({ status: "submitted" }), // Submissions waiting for grading
    ]);

    // --- More Complex Stats (Example: Roadmap Popularity) ---
    // Use aggregation pipeline to count users per roadmap
    const roadmapPopularity = await Roadmap.aggregate([
      {
        $project: {
          // Project only needed fields
          title: 1,
          userCount: { $size: "$user" }, // Get the size of the user array
        },
      },
      {
        $sort: { userCount: -1 }, // Sort by user count descending
      },
      {
        $limit: 5, // Limit to top 5 popular roadmaps
      },
    ]);

    // --- Prepare Response ---
    const dashboardData = {
      platformTotals: {
        users: totalUsers,
        roadmaps: totalRoadmaps,
        lessons: totalLessons,
        tasks: totalTasks,
        submissions: totalSubmissions,
      },
      gradingQueue: {
        pendingSubmissions: pendingSubmissions,
      },
      roadmapPopularity: roadmapPopularity,
      // Add more admin stats as needed (e.g., task completion rates, active users)
    };

    res.json(dashboardData);
  } catch (error) {
    console.error("Error fetching admin dashboard data:", error);
    res.status(500).json({
      message: "Server error fetching admin dashboard data.",
      error: error.message,
    });
  }
};

module.exports = {
  getUserDashboardData,
  getAdminDashboardData,
};
