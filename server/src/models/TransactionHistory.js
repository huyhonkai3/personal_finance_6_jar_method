// Mongoose schema: TransactionHistory (Audit Trail — US5.3)
// Field & index chi tiết: docs/Data_Model_va_API_Design_Ung_dung_Quan_ly_Tai_chinh_6_Lo.md (muc 3.6)

// Giai đoạn 3: chỉ khai báo schema. Việc THỰC SỰ ghi document loại này (khi
// sửa/xoá giao dịch) là trách nhiệm của Giai đoạn 8 (Recalculation Engine),
// gắn với PATCH/DELETE /transactions/:id — endpoint chỉnh sửa dữ liệu quá
// khứ đầy đủ (khác với PATCH /transactions/:id/jar ở Giai đoạn 3, chỉ đổi
// nhanh lọ phân loại, không cần audit trail đầy đủ).
import mongoose from "mongoose";

export const TRANSACTION_HISTORY_CHANGE_TYPES = ["create", "update", "delete"];

const { ObjectId } = mongoose.Schema.Types;

const transactionHistorySchema = mongoose.Schema({
  userId: { type: ObjectId, ref: "User", required: true, index: true },
  transactionId: {
    type: ObjectId,
    ref: "Transaction",
    required: true,
    index: true,
  },

  changeType: {
    type: String,
    enum: TRANSACTION_HISTORY_CHANGE_TYPES,
    required: true,
  },
  // Chỉ lưu các field thay đổi (amount, jarId, transactionDate...)
  diff: [
    {
      _id: false,
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
    },
  ],
  triggeredRecalc: { type: Boolean, default: false },
  // Danh sách kỳ bị re-calculate dây chuyền - US 5.2 AC2.
  affectedPeriodIds: [{ type: ObjectId, ref: "FinancialPeriod" }],
  // Nếu edit này sinh ra Adjustment Entry - US 5.4 AC2.
  createAdjustmentTransactionIds: [{ type: ObjectId, ref: "Transaction" }],
  changeAt: { type: Date, default: Date.now },
});

export const TransactionHistory = mongoose.model(
  "TransactionHistory",
  transactionHistorySchema,
);
