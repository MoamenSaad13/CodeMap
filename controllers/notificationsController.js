const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const NotificationService = require("../services/notificationService");

/**
 * @description Get notifications for the authenticated user with enhanced filtering and sorting.
 * @route GET /notifications
 * @access Private
 */
const getMyNotifications = async (req, res) => {
  const userId = req.user.id;
  const {
    limit = 20,
    page = 1,
    type,
    read,
    groupId,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    // Build filter object
    const filter = { assignedTo: userId };
    
    if (type) filter.type = type;
    if (read !== undefined) filter.read = read === "true";
    if (groupId) filter.groupId = groupId;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;
    
    // Fetch notifications with enhanced population
    const notifications = await Notification.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("createdBy", "first_name last_name profile_image")
      .populate("relatedTask", "title description")
      .populate("relatedSubmission", "title status")
      .populate("relatedRoadmap", "title description")
      .populate("relatedLesson", "title")
      .populate("relatedCategory", "name")
      .lean();

    // Get total count of notifications for pagination
    const [totalNotifications, unreadCount] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, read: false }),
    ]);

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalNotifications / parseInt(limit)),
          totalNotifications,
          limit: parseInt(limit),
        },
        stats: {
          unreadCount,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching user notifications:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching notifications.",
      error: error.message,
    });
  }
};

/**
 * @description Get notification statistics for the authenticated user.
 * @route GET /notifications/stats
 * @access Private
 */
const getNotificationStats = async (req, res) => {
  const userId = req.user.id;

  try {
    const stats = await Notification.aggregate([
      { $match: { assignedTo: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          unread: { $sum: { $cond: [{ $eq: ["$read", false] }, 1, 0] } },
        },
      },
    ]);

    const result = stats[0] || {
      total: 0,
      unread: 0,
    };

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching notification stats:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching notification statistics.",
      error: error.message,
    });
  }
};

/**
 * @description Create a new notification (admin/system use).
 * @route POST /notifications
 * @access Private (Admin or System)
 */
const createNotification = async (req, res) => {
  try {
    const notificationData = {
      ...req.body,
      createdBy: req.user.id,
    };

    const notification = await NotificationService.createNotification(notificationData);

    res.status(201).json({
      success: true,
      message: "Notification created successfully.",
      data: notification,
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating notification.",
      error: error.message,
    });
  }
};

/**
 * @description Create bulk notifications.
 * @route POST /notifications/bulk
 * @access Private (Admin or System)
 */
const createBulkNotifications = async (req, res) => {
  try {
    const { notifications } = req.body;
    
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Notifications array is required and cannot be empty.",
      });
    }

    const results = await NotificationService.createBulkNotifications(
      notifications,
      req.user.id
    );

    res.status(201).json({
      success: true,
      message: `${results.length} notifications created successfully.`,
      data: results,
    });
  } catch (error) {
    console.error("Error creating bulk notifications:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating bulk notifications.",
      error: error.message,
    });
  }
};

/**
 * @description Mark a specific notification as read and track analytics.
 * @route PATCH /notifications/:notificationId/read
 * @access Private
 */
const markNotificationAsRead = async (req, res) => {
  const { notificationId } = req.params;
  const userId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Notification ID.",
    });
  }

  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, assignedTo: userId, read: false },
      {
        $set: { read: true, readAt: new Date() },
        $inc: { "analytics.clickCount": 1 },
        $set: { "analytics.lastClickedAt": new Date() },
      },
      { new: true }
    );

    if (!notification) {
      const checkExists = await Notification.findOne({
        _id: notificationId,
        assignedTo: userId,
      });
      
      if (!checkExists) {
        return res.status(404).json({
          success: false,
          message: "Notification not found or you are not authorized.",
        });
      } else {
        return res.status(200).json({
          success: true,
          message: "Notification was already marked as read.",
          data: checkExists,
        });
      }
    }

    res.json({
      success: true,
      message: "Notification marked as read.",
      data: notification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      message: "Server error marking notification as read.",
      error: error.message,
    });
  }
};

/**
 * @description Mark multiple notifications as read.
 * @route PATCH /notifications/read-multiple
 * @access Private
 */
const markMultipleAsRead = async (req, res) => {
  const { notificationIds } = req.body;
  const userId = req.user.id;

  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Notification IDs array is required.",
    });
  }

  // Validate all IDs
  const invalidIds = notificationIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification IDs found.",
      invalidIds,
    });
  }

  try {
    const result = await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        assignedTo: userId,
        read: false,
      },
      {
        $set: { read: true, readAt: new Date() },
        $inc: { "analytics.clickCount": 1 },
      }
    );

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read.`,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error("Error marking multiple notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Server error marking notifications as read.",
      error: error.message,
    });
  }
};

/**
 * @description Mark all unread notifications as read for the authenticated user.
 * @route PATCH /notifications/read-all
 * @access Private
 */
const markAllNotificationsAsRead = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await Notification.updateMany(
      { assignedTo: userId, read: false },
      {
        $set: { read: true, readAt: new Date() },
        $inc: { "analytics.clickCount": 1 },
      }
    );

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read.`,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Server error marking all notifications as read.",
      error: error.message,
    });
  }
};

/**
 * @description Track notification action click.
 * @route POST /notifications/:notificationId/action
 * @access Private
 */
const trackActionClick = async (req, res) => {
  const { notificationId } = req.params;
  const { action } = req.body;
  const userId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Notification ID.",
    });
  }

  try {
    const updateQuery = {
      $inc: {
        "analytics.clickCount": 1,
        [`analytics.actionClicks.${action}`]: 1,
      },
      $set: { "analytics.lastClickedAt": new Date() },
    };

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, assignedTo: userId },
      updateQuery,
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found or you are not authorized.",
      });
    }

    res.json({
      success: true,
      message: "Action click tracked successfully.",
      data: { action, clickCount: notification.analytics.clickCount },
    });
  } catch (error) {
    console.error("Error tracking action click:", error);
    res.status(500).json({
      success: false,
      message: "Server error tracking action click.",
      error: error.message,
    });
  }
};

/**
 * @description Delete a specific notification.
 * @route DELETE /notifications/:notificationId
 * @access Private
 */
const deleteNotification = async (req, res) => {
  const { notificationId } = req.params;
  const userId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Notification ID.",
    });
  }

  try {
    const result = await Notification.deleteOne({
      _id: notificationId,
      assignedTo: userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found or you are not authorized to delete it.",
      });
    }

    res.json({
      success: true,
      message: "Notification deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({
      success: false,
      message: "Server error deleting notification.",
      error: error.message,
    });
  }
};

/**
 * @description Delete multiple notifications.
 * @route DELETE /notifications/bulk
 * @access Private
 */
const deleteBulkNotifications = async (req, res) => {
  const { notificationIds } = req.body;
  const userId = req.user.id;

  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Notification IDs array is required.",
    });
  }

  // Validate all IDs
  const invalidIds = notificationIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
  if (invalidIds.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification IDs found.",
      invalidIds,
    });
  }

  try {
    const result = await Notification.deleteMany({
      _id: { $in: notificationIds },
      assignedTo: userId,
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} notifications successfully.`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    console.error("Error deleting bulk notifications:", error);
    res.status(500).json({
      success: false,
      message: "Server error deleting notifications.",
      error: error.message,
    });
  }
};

/**
 * @description Clean up expired notifications.
 * @route DELETE /notifications/cleanup
 * @access Private (Admin)
 */
const cleanupExpiredNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      expiresAt: { $lt: new Date() },
    });

    res.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} expired notifications.`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    console.error("Error cleaning up expired notifications:", error);
    res.status(500).json({
      success: false,
      message: "Server error cleaning up expired notifications.",
      error: error.message,
    });
  }
};

module.exports = {
  getMyNotifications,
  getNotificationStats,
  createNotification,
  createBulkNotifications,
  markNotificationAsRead,
  markMultipleAsRead,
  markAllNotificationsAsRead,
  trackActionClick,
  deleteNotification,
  deleteBulkNotifications,
  cleanupExpiredNotifications,
};

