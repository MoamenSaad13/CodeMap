const cron = require('node-cron');
const User = require('../models/User');
const Lesson = require('../models/Lesson');
const Submission = require('../models/Submission');
const NotificationService = require('../services/notificationService');

/**
 * @description Generate and send weekly progress reports
 */
const sendWeeklyProgressReports = async () => {
  try {
    console.log('Starting weekly progress reports...');
    
    // Get all users who have enrolled roadmaps
    const users = await User.find({ 
      roadmap: { $exists: true, $not: { $size: 0 } }
    }).populate('roadmap completedlesson');
    
    for (const user of users) {
      const progressData = await calculateWeeklyProgress(user);
      
      if (progressData.hasActivity) {
        await NotificationService.createNotification({
          type: "user_activity",
          title: "📊 Your Weekly Progress Report",
          message: `Hi ${user.first_name}! Here's your learning progress for this week: You completed ${progressData.lessonsCompleted} lessons and ${progressData.tasksCompleted} tasks across ${progressData.activeRoadmaps} roadmaps. Keep up the great work!`,
          assignedTo: user._id,
          actions: [
            {
              label: "View Detailed Progress",
              action: "view",
              url: "/progress",
              style: "primary",
            },
            {
              label: "Continue Learning",
              action: "view",
              url: "/dashboard",
              style: "secondary",
            },
          ],
          metadata: {
            weeklyReport: true,
            reportDate: new Date(),
            lessonsCompleted: progressData.lessonsCompleted,
            tasksCompleted: progressData.tasksCompleted,
            activeRoadmaps: progressData.activeRoadmaps,
            totalTimeSpent: progressData.totalTimeSpent
          }
        });
      }
    }
    
    console.log(`Weekly progress reports sent to ${users.length} users`);
  } catch (error) {
    console.error('Error sending weekly progress reports:', error);
  }
};

/**
 * @description Calculate weekly progress for a user
 * @param {Object} user - User object with populated roadmap and completedlesson
 * @returns {Object} Progress data
 */
const calculateWeeklyProgress = async (user) => {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  try {
    // Count lessons completed this week
    const lessonsCompletedThisWeek = await Lesson.countDocuments({
      _id: { $in: user.completedlesson },
      updatedAt: { $gte: oneWeekAgo }
    });
    
    // Count tasks completed this week
    const tasksCompletedThisWeek = await Submission.countDocuments({
      user: user._id,
      status: { $in: ["submitted", "graded"] },
      completedAt: { $gte: oneWeekAgo }
    });
    
    // Get active roadmaps
    const activeRoadmaps = user.roadmap.length;
    
    // Calculate total time spent (if you track this)
    const submissions = await Submission.find({
      user: user._id,
      completedAt: { $gte: oneWeekAgo }
    });
    
    const totalTimeSpent = submissions.reduce((total, submission) => {
      return total + (submission.timeSpent || 0);
    }, 0);
    
    return {
      hasActivity: lessonsCompletedThisWeek > 0 || tasksCompletedThisWeek > 0,
      lessonsCompleted: lessonsCompletedThisWeek,
      tasksCompleted: tasksCompletedThisWeek,
      activeRoadmaps: activeRoadmaps,
      totalTimeSpent: Math.round(totalTimeSpent / 60) // Convert to minutes
    };
  } catch (error) {
    console.error('Error calculating weekly progress:', error);
    return { hasActivity: false };
  }
};

/**
 * @description Initialize weekly progress report cron job
 */
const initializeWeeklyReports = () => {
  // Run every Sunday at 8 PM
  cron.schedule('0 20 * * 0', () => {
    console.log('Running weekly progress reports...');
    sendWeeklyProgressReports();
  });
  
  console.log('Weekly progress reports cron job initialized');
};

module.exports = {
  sendWeeklyProgressReports,
  calculateWeeklyProgress,
  initializeWeeklyReports
};

