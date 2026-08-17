// Mongoose schema: Notification
// Field & index chi tiết: docs/Data_Model_va_API_Design_Ung_dung_Quan_ly_Tai_chinh_6_Lo.md (muc 3.10)

// Giai đoạn 4: chỉ dùng type='salary_reminder' (jobs/salaryReminder.job.js).
// Các type còn lại (threshold_80/90, month_end_pending, debt_repayment_applied)
// được các giai đoạn sau (5, 6, 7) tạo ra khi tính năng tương ứng hoàn thiện.
// API đọc/đánh dấu đã đọc (GET /notifications, PATCH /notifications/:id/read)
// thuộc Giai đoạn 5 theo Backend Plan, chưa code ở đây.
import mongoose from "mongoose";

export const NOTIFICATION_TYPES = [
  "salary_reminder",
  "threshold_80",
  "threshold_90",
  "month_end_pending",
  "debt_repayment_applied",
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
  // VD {jarId, percentageUsed} hoặc {periodId}
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  // VD '/input' cho salary_reminder - US 2.4 AC2.
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
