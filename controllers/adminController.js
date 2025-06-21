const User = require("../models/User");
const Roadmap = require("../models/Roadmap");
const Stage = require("../models/Stage");
const Category = require("../models/Category");
const Lesson = require("../models/Lesson");
const Tasks = require("../models/Tasks");
const Contact = require("../models/Contact");
const Notification = require("../models/Notification");
const NotificationService = require("../services/notificationService"); // Import NotificationService

// @desc Get statistics and recent items for the admin dashboard
// @route GET /admin/stats
// @access Private (Admin)
const getDashboardStats = async (req, res) => {
  try {
    const [
      userCount,
      adminCount,
      roadmapCount,
      stageCount,
      categoryCount,
      lessonCount,
      taskCount,
      contactCount,
      notificationCount,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "admin" }),
      Roadmap.countDocuments(),
      Stage.countDocuments(),
      Category.countDocuments(),
      Lesson.countDocuments(),
      Tasks.countDocuments(),
      Contact.countDocuments(),
      Notification.countDocuments(),
    ]);

    const [
      recentUsers,
      recentRoadmaps,
      recentStages,
      recentCategories,
      recentLessons,
      recentTasks,
      recentContacts,
      recentNotifications,
    ] = await Promise.all([
      User.find().sort({ createdAt: -1 }).limit(5).select("first_name last_name email role createdAt").lean(),
      Roadmap.find().sort({ createdAt: -1 }).limit(5).select("title createdAt").lean(),
      Stage.find().sort({ createdAt: -1 }).limit(5).select("title createdAt").lean(),
      Category.find().sort({ createdAt: -1 }).limit(5).select("name createdAt").lean(),
      Lesson.find().sort({ createdAt: -1 }).limit(5).select("title createdAt").lean(),
      Tasks.find().sort({ createdAt: -1 }).limit(5).select("title description status createdAt").lean(),
      Contact.find().sort({ createdAt: -1 }).limit(5).select("name email subject createdAt").lean(),
      Notification.find().sort({ createdAt: -1 }).limit(5).select("message read user createdAt").lean(),
    ]);

    res.status(200).json({
      counts: {
        users: userCount,
        admins: adminCount,
        regularUsers: userCount - adminCount,
        roadmaps: roadmapCount,
        stages: stageCount,
        categories: categoryCount,
        lessons: lessonCount,
        tasks: taskCount,
        contactMessages: contactCount,
        notifications: notificationCount,
      },
      recentItems: {
        users: recentUsers,
        roadmaps: recentRoadmaps,
        stages: recentStages,
        categories: recentCategories,
        lessons: recentLessons,
        tasks: recentTasks,
        contacts: recentContacts,
        notifications: recentNotifications,
      }
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ message: "Server error fetching dashboard statistics" });
  }
};

// @desc Send system-wide announcement
// @route POST /admin/announcements
// @access Private (Admin)
const sendSystemAnnouncement = async (req, res) => {
  const { title, message } = req.body;
  const adminId = req.user.id;

  if (!title || !message) {
    return res.status(400).json({ message: "Title and message are required" });
  }

  try {
    // Get all active users
    const activeUsers = await User.find({}).select('_id');
    const userIds = activeUsers.map(user => user._id);
    
    // Create announcement for all users
    const notifications = await NotificationService.createSystemAnnouncement(
      userIds,
      title,
      message
    );
    
    console.log(`System announcement sent to ${userIds.length} users`);
    
    res.status(200).json({
      success: true,
      message: `Announcement sent to ${userIds.length} users`,
      notificationCount: notifications.length
    });
  } catch (error) {
    console.error("Error sending system announcement:", error);
    res.status(500).json({
      success: false,
      message: "Error sending system announcement",
      error: error.message
    });
  }
};

// @desc Send maintenance notification
// @route POST /admin/maintenance-notification
// @access Private (Admin)
const sendMaintenanceNotification = async (req, res) => {
  const { date, startTime, endTime, additionalInfo } = req.body;
  const adminId = req.user.id;

  if (!date || !startTime || !endTime) {
    return res.status(400).json({ message: "Date, start time, and end time are required" });
  }

  try {
    const activeUsers = await User.find({}).select('_id');
    const userIds = activeUsers.map(user => user._id);
    
    const maintenanceMessage = `Our platform will undergo scheduled maintenance on ${date} from ${startTime} to ${endTime}. During this time, some features may be temporarily unavailable. We apologize for any inconvenience.${additionalInfo ? ' ' + additionalInfo : ''}`;
    
    const notifications = await NotificationService.createSystemAnnouncement(
      userIds,
      "🔧 Scheduled Maintenance",
      maintenanceMessage
    );
    
    console.log(`Maintenance notification sent to ${userIds.length} users`);
    
    res.status(200).json({
      success: true,
      message: `Maintenance notification sent to ${userIds.length} users`,
      notificationCount: notifications.length
    });
  } catch (error) {
    console.error("Error sending maintenance notification:", error);
    res.status(500).json({
      success: false,
      message: "Error sending maintenance notification",
      error: error.message
    });
  }
};

module.exports = {
  getDashboardStats,
  sendSystemAnnouncement,
  sendMaintenanceNotification
};

