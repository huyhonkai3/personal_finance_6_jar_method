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
    startDay: {
      type: Date,
      required: true,
    },
    // endDate = 23:59:59 ngày cuối kỳ theo timezone user - US 4.3 AC1.
    // tính đơn giản bằng utils/date.js#getPeriod, chưa xử lý timezone chính xác tuyệt đối - Giai đoạn 6 sẽ thực hiện.
    // (Auto-snapshot) khi cronjob thực sự cần mốc 23:59 chuẩn xác.
    endDate: {
      type: Date,
      required: true,
    },
    // pending_close: đã qua auto-snapshot nhưng user chưa xử lý Modal Chốt tháng
    // chưa xử lý logic chuyển trạng thái ở giai đoạn 2 -> giai đoan 6 sẽ làm
    status: {
      type: String,
      enum: PERIOD_STATUSES,
      default: "open",
    },
    // Thời điểm cron job tạo snapshot (đúng 23:59) - US 4.3 AC1. Chưa dùng ở
    // Giai đoạn 2, chỉ khai báo field để Giai đoạn 6 dùng tiếp không phải
    // migrate schema.
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
