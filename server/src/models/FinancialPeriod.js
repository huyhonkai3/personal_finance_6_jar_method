// Mongoose schema: FinancialPeriod
// Field & index chi tiết: docs/Data_Model_va_API_Design_Ung_dung_Quan_ly_Tai_chinh_6_Lo.md (muc 3.3)
import mongoose from "mongoose";

export const PERIOD_STATUSES = ["open", "pending_close", "closed"];

const financialPeriodSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Khóa logic của kỳ, VD "2026-08". Duy nhất theo (userId, periodKey).
    periodKey: {
      type: String,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    // 23:59:59.999 ngày cuối kỳ theo timezone user - US4.3 AC1.
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: PERIOD_STATUSES,
      default: "open",
    },
    // Mốc logical của snapshot. Nếu scheduler chạy trễ vài giây/phút thì vẫn
    // lưu endDate để snapshot đại diện đúng thời điểm kết thúc kỳ.
    snapshotAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

financialPeriodSchema.index({ userId: 1, periodKey: 1 }, { unique: true });
financialPeriodSchema.index({ userId: 1, status: 1 });

export const FinancialPeriod = mongoose.model(
  "FinancialPeriod",
  financialPeriodSchema,
);
