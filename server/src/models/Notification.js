// Mongoose schema: Notification
import mongoose from "mongoose";

export const NOTIFICATION_TYPES = [
  "salary_reminder",
  "threshold_80",
  "threshold_90",
  "month_end_pending",
  "debt_repayment_applied",
  "adjustment_created",
];

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: NOTIFICATION_TYPES,
    required: true,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  deepLink: {
    type: String,
    default: null,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
});

notificationSchema.index({ userId: 1, isRead: 1, sentAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);
