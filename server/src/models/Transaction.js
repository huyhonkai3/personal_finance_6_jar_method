// Field & index chi tiết: docs/Data_Model_va_API_Design_Ung_dung_Quan_ly_Tai_chinh_6_Lo.md (muc 3.5)

// Bảng lõi của toàn hệ thống - dùng discriminator `type` thay vì tách 4
// collection riêng (nguyên tắc thiết kế #1, Data Model muc 1). Giai đoạn 3
// chỉ THỰC SỰ tạo document với type='expense'; các sub-object incomeMeta/
// transferMeta/adjustmentMeta được khai báo đầy đủ ngay từ bây giờ để tránh
// phải migrate schema ở các giai đoạn sau (4, 7, 8).
import mongoose from "mongoose";

export const TRANSACTION_TYPES = [
  "expense",
  "income",
  "transfer",
  "adjustment",
];
export const TRANSACTION_SOURCES = [
  "realtime",
  "bulk_input",
  "manual",
  "system",
];
export const INCOME_TYPES = ["standard_split", "targeted"];
export const TRANSFER_TRIGGERS = ["manual", "contextual_suggestion"];
export const ADJUSTMENT_REASONS = ["late_backfill_delta"];

const { ObjectId } = mongoose.Schema.Types;

const incomeMetaSchema = new mongoose.Schema(
  {
    incomeType: { type: String, enum: INCOME_TYPES },
    ratioSnapshot: [
      {
        _id: false,
        jarKey: String,
        percentage: Number,
      },
    ],
    allocations: [
      {
        _id: false,
        jarId: { type: ObjectId, ref: "Jar" },
      },
    ],
    debtRepayments: [
      {
        _id: false,
        debtId: { type: ObjectId, ref: "InternalDebt" },
        amount: Number,
      },
    ],
  },
  { _id: false },
);

const transferMetaSchema = new mongoose.Schema(
  {
    fromJarId: { type: ObjectId, ref: "Jar" },
    toJarId: { type: String, enum: TRANSFER_TRIGGERS },
    relatedExpenseTransactionId: { type: ObjectId, ref: "Transaction" },
    debtId: { type: ObjectId, ref: "InternalDebt" },
  },
  { _id: false },
);

const adjustmentMetaSchema = new mongoose.Schema(
  {
    reason: { type: String, enum: ADJUSTMENT_REASONS },
    affectedPeriodId: { type: ObjectId, ref: "FinancialPeriod" },
    sourceTransactionId: { type: ObjectId, ref: "Transaction" },
    deltaAmount: Number,
  },
  { _id: false },
);

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    // Luông dương, đơn vị đông - dấu +/- của dòng tiền được suy ra từ `type`,
    // không lưu trong `amount`.
    amount: { type: Number, required: true, min: 0 },
    // null với transfer/adjustment (không có văn bản gốc do user gõ)
    rawText: { type: String, default: null },
    description: { type: String, default: "" },

    // Ngày phát sinh thực tế (có thể backdate) - US 4.4.
    transactionDate: { type: Date, required: true },
    periodId: { type: ObjectId, ref: "FinancialPeriod", required: true },

    // Dùng cho type=expense, và income.incomeType=targeted (Giai đoạn 4).
    jarId: { type: ObjectId, ref: "Jar", default: null },

    // true nếu lộ được gán là kết quả dự đoán chưa chắc chắn - US 1.3
    isPredicted: { type: Boolean, default: false },
    predictionConfidence: { type: Number, min: 0, max: 1, default: null },
    matchedDictionaryRuleId: {
      type: ObjectId,
      ref: "PersonaDictionaryRule",
      default: null,
    },

    incomeMeta: { type: incomeMetaSchema, default: undefined },
    transferMeta: { type: transferMetaSchema, default: undefined },
    adjustmentMeta: { type: adjustmentMetaSchema, default: undefined },

    source: { type: String, enum: TRANSACTION_SOURCES, required: true },
    // Gom các dòng cùng 1 lần dán bulk-input, phục vụ truy vết.
    bulkBatchId: { type: String, default: null },

    // Soft-delete (nguyên tắc thiết kế #2) - phục vụ Audit Trail (US 5.3) và
    // Recalculation Engine (Giai đoạn 8), chưa dùng ở Giai đoạn 3.
    isDeleted: { type: Boolean, default: false },
    deleteAt: { type: Date, default: null },

    editCount: { type: Number, default: 0 },
    lastEditedAt: { type: Date, default: 0 },
  },
  { timestamps },
);

transactionSchema.index({ userId: 1, transactionDate: -1 });
transactionSchema.index({ userId: 1, periodId: 1 });
transactionSchema.index({ userId: 1, jarId: 1 });
transactionSchema.index({ userId: 1, type: 1 });
transactionSchema.index({ bulkBatchId: 1 });

export const Transaction = mongoose.model("Transaction", transactionSchema);
