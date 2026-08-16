// Field & index chi tiết: docs/Data_Model_va_API_Design_Ung_dung_Quan_ly_Tai_chinh_6_Lo.md (muc 3.4)
//
// Số liệu THEO TỪNG LỌ TRONG TỪNG KỲ - nền tảng cho cảnh báo 80/90% (Giai
// đoạn 5), Modal Chốt tháng (Giai đoạn 6), và Recalculation Engine (Giai
// đoạn 8). Ở Giai đoạn 2 này, model chỉ được khai báo đầy đủ field theo tài
// liệu Data Model - CHƯA có service nào tạo/ghi document loại này (việc đó
// bắt đầu từ Giai đoạn 3 khi Transaction Engine cần cộng dồn totalExpense).
import mongoose, { mongo } from "mongoose";

export const CLOSE_DECISIONS = ["rollover", "sweep"];

const jarPeriodStatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    jarId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Jar",
      required: true,
    },
    periodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinancialPeriod",
      required: true,
    },
    // = closingBalance kỳ trước sau khi áp quyết định rollover/sweep.
    openingBalance: { type: Number, default: 0 },
    // Tổng thu nhập được phẩn bổ vào lọ trong kỳ (Standard Split + Targeted)
    allocatedIncome: { type: Number, default: 0 },
    // Tổng chi trong kỳ (giá trị dương)
    totalExpense: { type: Number, default: 0 },
    // Tổng tiền mượn vào/ra trong kỳ (Epic 6)
    totalTransferIn: { type: Number, default: 0 },
    totalTransferOut: { type: Number, default: 0 },
    // Tổng các Adjustment Entry áp vào lọ trong kỳ này - US 5.4.
    totalAdjustment: { type: Number, default: 0 },

    // Chốt tại snapshotAt; null khi kỳ còn 'open' (số dư thực tế xem trực tiếp ở Jar.balance)
    closingBalance: { type: Number, default: null },
    // = openingBalance + allocatedIncome - mốc 100% để tính % cảnh báo.
    spendingLimit: { type: Number, default: 0 },

    // Chống gửi lặp cảnh báo - US 4.1 AC3.
    alertSent: {
      threshold80: { type: Boolean, default: false },
      threshold90: { type: Boolean, default: false },
    },

    // Quyết định user chọn ở Modal Chốt tháng - US 4.2. Chưa xử lý logic ở Giai đoạn 2.
    closeDecision: {
      type: String,
      enum: CLOSE_DECISIONS,
      default: null,
    },
    // Số tiền đã thực sự rollover/sweep tại thời điểm chốt - móc so sánh
    // khi tính delta cho Adjustment Entry (US 5.4 AC2). Chưa xử lý logic ở Giai đoạn 2.
    closeDecisionAmount: { type: Number, default: null },
  },
  { timestamps: true },
);

jarPeriodStatSchema.index(
  { userId: 1, jarId: 1, periodId: 1 },
  { unique: true },
);

export const JarPeriodStat = mongoose.model(
  "JarPeriodStat",
  jarPeriodStatSchema,
);
