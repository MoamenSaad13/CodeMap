const Notification = require("../models/Notification");
const mongoose = require("mongoose");

/**
 * @description Centralized notification service for creating and managing notifications.
 */
class NotificationService {
  /**
   * @description Notification templates for consistent messaging.
   */
  static templates = {
    grading: {
      title: "Assignment Graded",
      message: "Your assignment \'{{taskTitle}}\' has been graded. Score: {{score}}/{{maxScore}}",
    },
    new_task: {
      title: "New Task Assigned",
      message: "A new task \'{{taskTitle}}\' has been assigned to you in {{categoryName}}",
    },
    reminder: {
      title: "Reminder",
      message: "Don\'t forget: {{reminderText}}",
    },
    announcement: {
      title: "Announcement",
      message: "{{announcementText}}",
    },
    enrollment: {
      title: "Course Enrollment",
      message: "You have been enrolled in \'{{courseName}}\'",
    },
    unenrollment: {
      title: "Course Unenrollment",
      message: "You have been unenrolled from \'{{courseName}}\'",
    },
    system: {
      title: "System Notification",
      message: "{{systemMessage}}",
    },
    user_activity: {
      title: "User Activity",
      message: "{{activityMessage}}",
    },
    achievement: {
      title: "Achievement Unlocked!",
      message: "Congratulations! You\'ve earned the \'{{achievementName}}\' achievement",
    },
    security: {
      title: "Security Alert",
      message: "{{securityMessage}}",
    },
    deadline: {
      title: "Deadline Reminder",
      message: "Task \'{{taskTitle}}\' is due {{timeRemaining}}",
    },
    mention: {
      title: "You were mentioned",
      message: "{{mentionerName}} mentioned you in {{context}}",
    },
    follow: {
      title: "New Follower",
      message: "{{followerName}} started following you",
    },
    comment: {
      title: "New Comment",
      message: "{{commenterName}} commented on {{context}}",
    },
  };

  /**
   * @description Create a single notification.
   * @param {Object} notificationData - Notification data
   * @returns {Promise<Object>} Created notification
   */
  static async createNotification(notificationData) {
    try {
      // Apply template if specified
      if (notificationData.template && this.templates[notificationData.template]) {
        const template = this.templates[notificationData.template];
        notificationData.title = this.applyTemplate(template.title, notificationData.templateVariables || {});
        notificationData.message = this.applyTemplate(template.message, notificationData.templateVariables || {});
      }

      // Set default values
      const notification = new Notification({
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        htmlContent: notificationData.htmlContent,
        assignedTo: notificationData.assignedTo,
        createdBy: notificationData.createdBy,
        relatedRoadmap: notificationData.relatedRoadmap,
        relatedTask: notificationData.relatedTask,
        relatedSubmission: notificationData.relatedSubmission,
        relatedLesson: notificationData.relatedLesson,
        relatedCategory: notificationData.relatedCategory,
        actions: notificationData.actions || [],
        scheduledFor: notificationData.scheduledFor,
        expiresAt: notificationData.expiresAt,
        groupId: notificationData.groupId,
        template: notificationData.template,
        templateVariables: notificationData.templateVariables,
        metadata: notificationData.metadata || {},
      });

      await notification.save();
      return notification;
    } catch (error) {
      console.error("Error creating notification:", error);
      throw error;
    }
  }

  /**
   * @description Create multiple notifications at once.
   * @param {Array} notificationsData - Array of notification data
   * @param {String} createdBy - ID of the user creating the notifications
   * @returns {Promise<Array>} Created notifications
   */
  static async createBulkNotifications(notificationsData, createdBy) {
    try {
      const notifications = notificationsData.map(data => {
        // Apply template if specified
        if (data.template && this.templates[data.template]) {
          const template = this.templates[data.template];
          data.title = this.applyTemplate(template.title, data.templateVariables || {});
          data.message = this.applyTemplate(template.message, data.templateVariables || {});
        }

        return {
          type: data.type,
          title: data.title,
          message: data.message,
          htmlContent: data.htmlContent,
          assignedTo: data.assignedTo,
          createdBy: createdBy,
          relatedRoadmap: data.relatedRoadmap,
          relatedTask: data.relatedTask,
          relatedSubmission: data.relatedSubmission,
          relatedLesson: data.relatedLesson,
          relatedCategory: data.relatedCategory,
          actions: data.actions || [],
          scheduledFor: data.scheduledFor,
          expiresAt: data.expiresAt,
          groupId: data.groupId,
          template: data.template,
          templateVariables: data.templateVariables,
          metadata: data.metadata || {},
        };
      });

      const result = await Notification.insertMany(notifications);
      return result;
    } catch (error) {
      console.error("Error creating bulk notifications:", error);
      throw error;
    }
  }

  /**
   * @description Create notification for task assignment.
   * @param {String} userId - User ID to notify
   * @param {Object} task - Task object
   * @param {String} createdBy - ID of the user creating the notification
   * @returns {Promise<Object>} Created notification
   */
  static async notifyTaskAssignment(userId, task, createdBy) {
    return this.createNotification({
      type: "new_task",
      template: "new_task",
      assignedTo: userId,
      createdBy: createdBy,
      relatedTask: task._id,
      relatedCategory: task.category,
      templateVariables: {
        taskTitle: task.title,
        categoryName: task.categoryName || "Unknown Category",
      },
      actions: [
        {
          label: "View Task",
          action: "view",
          url: `/tasks/${task._id}`,
          style: "primary",
        },
      ],
    });
  }

  /**
   * @description Create notification for grading.
   * @param {String} userId - User ID to notify
   * @param {Object} submission - Submission object
   * @param {String} createdBy - ID of the grader
   * @returns {Promise<Object>} Created notification
   */
  static async notifyGrading(userId, submission, createdBy) {
    return this.createNotification({
      type: "grading",
      template: "grading",
      assignedTo: userId,
      createdBy: createdBy,
      relatedSubmission: submission._id,
      relatedTask: submission.task,
      templateVariables: {
        taskTitle: submission.taskTitle || "Unknown Task",
        score: submission.score || 0,
        maxScore: submission.maxScore || 100,
      },
      actions: [
        {
          label: "View Submission",
          action: "view",
          url: `/submissions/${submission._id}`,
          style: "primary",
        },
      ],
    });
  }

  /**
   * @description Create deadline reminder notification.
   * @param {String} userId - User ID to notify
   * @param {Object} task - Task object
   * @param {String} timeRemaining - Human-readable time remaining
   * @returns {Promise<Object>} Created notification
   */
  static async notifyDeadline(userId, task, timeRemaining) {
    return this.createNotification({
      type: "deadline",
      template: "deadline",
      assignedTo: userId,
      relatedTask: task._id,
      templateVariables: {
        taskTitle: task.title,
        timeRemaining: timeRemaining,
      },
      actions: [
        {
          label: "View Task",
          action: "view",
          url: `/tasks/${task._id}`,
          style: "warning",
        },
      ],
    });
  }

  /**
   * @description Create achievement notification.
   * @param {String} userId - User ID to notify
   * @param {String} achievementName - Name of the achievement
   * @param {Object} metadata - Additional achievement data
   * @returns {Promise<Object>} Created notification
   */
  static async notifyAchievement(userId, achievementName, metadata = {}) {
    return this.createNotification({
      type: "achievement",
      template: "achievement",
      assignedTo: userId,
      templateVariables: {
        achievementName: achievementName,
      },
      metadata: metadata,
      actions: [
        {
          label: "View Achievements",
          action: "view",
          url: "/achievements",
          style: "success",
        },
      ],
    });
  }

  /**
   * @description Create system announcement notification.
   * @param {Array} userIds - Array of user IDs to notify
   * @param {String} title - Announcement title
   * @param {String} message - Announcement message
   * @returns {Promise<Array>} Created notifications
   */
  static async createSystemAnnouncement(userIds, title, message) {
    const notifications = userIds.map(userId => ({
      type: "announcement",
      title: title,
      message: message,
      assignedTo: userId,
      groupId: `announcement_${Date.now()}`,
    }));

    return this.createBulkNotifications(notifications, null);
  }

  /**
   * @description Apply template variables to a template string.
   * @param {String} template - Template string with {{variable}} placeholders
   * @param {Object} variables - Variables to replace
   * @returns {String} Processed template
   */
  static applyTemplate(template, variables) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] || match;
    });
  }

  /**
   * @description Process scheduled notifications.
   * This method should be called by a cron job or scheduler.
   * @returns {Promise<Number>} Number of notifications processed
   */
  static async processScheduledNotifications() {
    try {
      const now = new Date();
      const scheduledNotifications = await Notification.find({
        scheduledFor: { $lte: now },
        deliveryStatus: "pending",
      });

      let processedCount = 0;
      for (const notification of scheduledNotifications) {
        try {
          notification.deliveryStatus = "delivered";
          notification.deliveryAttempts += 1;
          notification.lastDeliveryAttempt = now;
          await notification.save();
          processedCount++;
        } catch (error) {
          notification.deliveryStatus = "failed";
          notification.deliveryError = error.message;
          notification.deliveryAttempts += 1;
          notification.lastDeliveryAttempt = now;
          await notification.save();
        }
      }

      return processedCount;
    } catch (error) {
      console.error("Error processing scheduled notifications:", error);
      throw error;
    }
  }

  /**
   * @description Clean up expired notifications.
   * @returns {Promise<Number>} Number of notifications cleaned up
   */
  static async cleanupExpiredNotifications() {
    try {
      const result = await Notification.deleteMany({
        expiresAt: { $lt: new Date() },
      });
      return result.deletedCount;
    } catch (error) {
      console.error("Error cleaning up expired notifications:", error);
      throw error;
    }
  }
}

module.exports = NotificationService;

