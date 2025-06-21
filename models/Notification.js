const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/**
 * @description Enhanced Schema for Notifications within the platform.
 * Simplified by removing priority levels.
 */
const notificationSchema = new mongoose.Schema(
  {
    /**
     * @description Type of notification with expanded categories.
     */
    type: {
      type: String,
      required: [true, "Notification type is required."],
      enum: {
        values: [
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
        ],
        message: "{VALUE} is not a supported notification type.",
      },
      index: true,
    },

    /**
     * @description Title/subject of the notification.
     */
    title: {
      type: String,
      required: [true, "Notification title is required."],
      maxlength: [200, "Title cannot exceed 200 characters."],
    },

    /**
     * @description The main content/message of the notification.
     */
    message: {
      type: String,
      required: [true, "Notification message is required."],
      maxlength: [1000, "Message cannot exceed 1000 characters."],
    },

    /**
     * @description Optional rich content in HTML format.
     */
    htmlContent: {
      type: String,
      default: null,
    },

    /**
     * @description Read status of the notification for the assigned user.
     */
    read: {
      type: Boolean,
      default: false,
      index: true,
    },

    /**
     * @description Timestamp when the notification was read.
     */
    readAt: {
      type: Date,
      default: null,
    },

    /**
     * @description Reference to the User this notification is intended for.
     */
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Notification must be assigned to a user."],
      index: true,
    },

    /**
     * @description Optional reference to the User who triggered the notification.
     */
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /**
     * @description Optional reference to a related Roadmap.
     */
    relatedRoadmap: {
      type: Schema.Types.ObjectId,
      ref: "Roadmap",
      default: null,
    },

    /**
     * @description Optional reference to a related Task.
     */
    relatedTask: {
      type: Schema.Types.ObjectId,
      ref: "Tasks",
      default: null,
    },

    /**
     * @description Optional reference to a related Submission.
     */
    relatedSubmission: {
      type: Schema.Types.ObjectId,
      ref: "Submission",
      default: null,
    },

    /**
     * @description Optional reference to a related Lesson.
     */
    relatedLesson: {
      type: Schema.Types.ObjectId,
      ref: "Lesson",
      default: null,
    },

    /**
     * @description Optional reference to a related Category.
     */
    relatedCategory: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    /**
     * @description Optional action buttons for the notification.
     */
    actions: [
      {
        label: {
          type: String,
          required: true,
          maxlength: [50, "Action label cannot exceed 50 characters."],
        },
        action: {
          type: String,
          required: true,
          enum: ["approve", "reject", "view", "download", "reply", "custom"],
        },
        url: {
          type: String,
          default: null,
        },
        style: {
          type: String,
          enum: ["primary", "secondary", "success", "warning", "danger"],
          default: "primary",
        },
      },
    ],

    /**
     * @description Scheduled delivery time (for future notifications).
     */
    scheduledFor: {
      type: Date,
      default: null,
      index: true,
    },

    /**
     * @description Expiration date for the notification.
     */
    expiresAt: {
      type: Date,
      default: null,
    },

    /**
     * @description Delivery status tracking.
     */
    deliveryStatus: {
      type: String,
      enum: ["pending", "delivered", "failed", "expired"],
      default: "pending",
      index: true,
    },

    /**
     * @description Delivery attempts count.
     */
    deliveryAttempts: {
      type: Number,
      default: 0,
    },

    /**
     * @description Last delivery attempt timestamp.
     */
    lastDeliveryAttempt: {
      type: Date,
      default: null,
    },

    /**
     * @description Delivery error message (if failed).
     */
    deliveryError: {
      type: String,
      default: null,
    },

    /**
     * @description Notification group/thread ID for grouping related notifications.
     */
    groupId: {
      type: String,
      default: null,
      index: true,
    },

    /**
     * @description Template used for generating this notification.
     */
    template: {
      type: String,
      default: null,
    },

    /**
     * @description Template variables used for generating the notification.
     */
    templateVariables: {
      type: Schema.Types.Mixed,
      default: null,
    },

    /**
     * @description Analytics data.
     */
    analytics: {
      clickCount: {
        type: Number,
        default: 0,
      },
      lastClickedAt: {
        type: Date,
        default: null,
      },
      actionClicks: {
        type: Map,
        of: Number,
        default: new Map(),
      },
    },

    /**
     * @description Additional metadata.
     */
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// --- Indexes for Performance ---
notificationSchema.index({ assignedTo: 1, read: 1, createdAt: -1 });
notificationSchema.index({ scheduledFor: 1, deliveryStatus: 1 });
notificationSchema.index({ expiresAt: 1 });
notificationSchema.index({ groupId: 1, assignedTo: 1 });

// --- Middleware ---

// Automatically set readAt when read status changes to true
notificationSchema.pre("save", function (next) {
  if (this.isModified("read") && this.read && !this.readAt) {
    this.readAt = new Date();
  }
  next();
});

// Automatically set deliveryStatus to delivered when created (for immediate notifications)
notificationSchema.pre("save", function (next) {
  if (this.isNew && !this.scheduledFor && this.deliveryStatus === "pending") {
    this.deliveryStatus = "delivered";
  }
  next();
});

module.exports = mongoose.model("Notification", notificationSchema);

