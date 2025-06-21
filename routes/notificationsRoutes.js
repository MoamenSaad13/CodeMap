const express = require("express");
const router = express.Router();
const notificationsController = require("../controllers/notificationsController");
const authenticateUser = require("../middleware/authMiddleware");
const { body, query, param } = require("express-validator");
const validateRequest = require("../middleware/validateRequest");

// Apply authentication middleware to all notification routes
router.use(authenticateUser);

// --- Validation Middleware ---

const validateNotificationCreation = [
  body("type")
    .isIn([
      "grading",
      "new_task",
      "reminder",
      "announcement",
      "enrollment",
      "unenrollment",
      "system",
      "user_activity",
      "achievement",
      "security",
      "deadline",
      "mention",
      "follow",
      "comment",
      "other",
    ])
    .withMessage("Invalid notification type"),
  body("title")
    .isLength({ min: 1, max: 200 })
    .withMessage("Title must be between 1 and 200 characters"),
  body("message")
    .isLength({ min: 1, max: 1000 })
    .withMessage("Message must be between 1 and 1000 characters"),
  body("assignedTo")
    .isMongoId()
    .withMessage("Invalid user ID"),
  body("scheduledFor")
    .optional()
    .isISO8601()
    .withMessage("Invalid scheduled date format"),
  body("expiresAt")
    .optional()
    .isISO8601()
    .withMessage("Invalid expiration date format"),
];

const validateBulkNotifications = [
  body("notifications")
    .isArray({ min: 1, max: 100 })
    .withMessage("Notifications must be an array with 1-100 items"),
  body("notifications.*.type")
    .isIn([
      "grading",
      "new_task",
      "reminder",
      "announcement",
      "enrollment",
      "unenrollment",
      "system",
      "user_activity",
      "achievement",
      "security",
      "deadline",
      "mention",
      "follow",
      "comment",
      "other",
    ])
    .withMessage("Invalid notification type"),
  body("notifications.*.title")
    .isLength({ min: 1, max: 200 })
    .withMessage("Title must be between 1 and 200 characters"),
  body("notifications.*.message")
    .isLength({ min: 1, max: 1000 })
    .withMessage("Message must be between 1 and 1000 characters"),
  body("notifications.*.assignedTo")
    .isMongoId()
    .withMessage("Invalid user ID"),
];

const validateNotificationQuery = [
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("type")
    .optional()
    .isIn([
      "grading",
      "new_task",
      "reminder",
      "announcement",
      "enrollment",
      "unenrollment",
      "system",
      "user_activity",
      "achievement",
      "security",
      "deadline",
      "mention",
      "follow",
      "comment",
      "other",
    ])
    .withMessage("Invalid notification type"),
  query("read")
    .optional()
    .isBoolean()
    .withMessage("Read must be a boolean value"),
  query("sortBy")
    .optional()
    .isIn(["createdAt", "type", "read"])
    .withMessage("Invalid sort field"),
  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("Sort order must be asc or desc"),
];

const validateNotificationId = [
  param("notificationId")
    .isMongoId()
    .withMessage("Invalid notification ID"),
];

const validateMultipleIds = [
  body("notificationIds")
    .isArray({ min: 1, max: 50 })
    .withMessage("Notification IDs must be an array with 1-50 items"),
  body("notificationIds.*")
    .isMongoId()
    .withMessage("Invalid notification ID"),
];

const validateActionTracking = [
  param("notificationId")
    .isMongoId()
    .withMessage("Invalid notification ID"),
  body("action")
    .isLength({ min: 1, max: 50 })
    .withMessage("Action must be between 1 and 50 characters"),
];

// --- Routes for Authenticated Users ---

/**
 * @route GET /notifications
 * @desc Get notifications for the authenticated user with filtering and pagination
 * @access Private
 */
router.get(
  "/",
  validateNotificationQuery,
  validateRequest,
  notificationsController.getMyNotifications
);

/**
 * @route GET /notifications/stats
 * @desc Get notification statistics for the authenticated user
 * @access Private
 */
router.get("/stats", notificationsController.getNotificationStats);

/**
 * @route POST /notifications
 * @desc Create a new notification (admin/system use)
 * @access Private (Admin)
 */
router.post(
  "/",
  validateNotificationCreation,
  validateRequest,
  notificationsController.createNotification
);

/**
 * @route POST /notifications/bulk
 * @desc Create multiple notifications at once
 * @access Private (Admin)
 */
router.post(
  "/bulk",
  validateBulkNotifications,
  validateRequest,
  notificationsController.createBulkNotifications
);

/**
 * @route PATCH /notifications/:notificationId/read
 * @desc Mark a specific notification as read
 * @access Private
 */
router.post(
  "/:notificationId/read",
  validateNotificationId,
  validateRequest,
  notificationsController.markNotificationAsRead
);

/**
 * @route PATCH /notifications/read-multiple
 * @desc Mark multiple notifications as read
 * @access Private
 */
router.post(
  "/read-multiple",
  validateMultipleIds,
  validateRequest,
  notificationsController.markMultipleAsRead
);

/**
 * @route PATCH /notifications/read-all
 * @desc Mark all unread notifications as read
 * @access Private
 */
router.post("/read-all", notificationsController.markAllNotificationsAsRead);

/**
 * @route POST /notifications/:notificationId/action
 * @desc Track notification action click for analytics
 * @access Private
 */
router.post(
  "/:notificationId/action",
  validateActionTracking,
  validateRequest,
  notificationsController.trackActionClick
);

/**
 * @route DELETE /notifications/:notificationId
 * @desc Delete a specific notification
 * @access Private
 */
router.delete(
  "/:notificationId",
  validateNotificationId,
  validateRequest,
  notificationsController.deleteNotification
);

/**
 * @route DELETE /notifications/bulk
 * @desc Delete multiple notifications
 * @access Private
 */
router.delete(
  "/bulk",
  validateMultipleIds,
  validateRequest,
  notificationsController.deleteBulkNotifications
);

/**
 * @route DELETE /notifications/cleanup
 * @desc Clean up expired notifications (admin only)
 * @access Private (Admin)
 */
router.delete("/cleanup", notificationsController.cleanupExpiredNotifications);

module.exports = router;

