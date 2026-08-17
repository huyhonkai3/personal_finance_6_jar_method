// Transaction là bảng trung tâm: expense | income | transfer | adjustment.
import mongoose from "mongoose";

export const TRANSACTION_TYPES = ["expense", "income", "transfer", "adjustment"];
export const TRANSACTION_SOURCES = ["realtime", "bulk_input", "manual", "system"];
export const INCOME_TYPES = ["standard_split", "targeted"];
export const TRANSFER_TRIGGERS = ["manual", "contextual_suggestion"];
export const ADJUSTMENT_REASONS = ["late_backfill_delta"];

const { ObjectId } = mongoose.Schema.Types;

const incomeMetaSchema = new mongoose.Schema(
  {
    incomeType: { type: String, enum: INCOME_TYPES },
    ratioSnapshot: [{ _id: false, jarKey: String, percentage: Number }],
    allocations: [
      {
        _id: false,
        jarId: { type: ObjectId, ref: "Jar" },
        amount: { type: Number, min: 0 },
      },
    ],
    debtRepayments: [
      {
        _id: false,
        debtId: { type: ObjectId, ref: "InternalDebt" },
        amount: { type: Number, min: 0 },
      },
    ],
  },
  { _id: false },
);

const transferMetaSchema = new mongoose.Schema(
  {
    fromJarId: { type: ObjectId, ref: "Jar" },
    toJarId: { type: ObjectId, ref: "Jar" },
    trigger: { type: String, enum: TRANSFER_TRIGGERS },
    relatedExpenseTransactionId: {
      type: ObjectId,
      ref: "Transaction",
      default: null,
    },
    debtId: { type: ObjectId, ref: "InternalDebt", default: null },
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
    amount: { type: Number, required: true, min: 0 },
    rawText: { type: String, default: null },
    description: { type: String, default: "" },
    transactionDate: { type: Date, required: true },
    periodId: { type: ObjectId, ref: "FinancialPeriod", required: true },
    jarId: { type: ObjectId, ref: "Jar", default: null },
    isPredicted: { type: Boolean, default: false },
    predictionConfidence: { type: Number, min: 0, max: 1, default: null },
    matchedDictionaryRuleId: {
      type: ObjectId,
      ref: "PersonalDictionaryRule",
      default: null,
    },
    incomeMeta: { type: incomeMetaSchema, default: undefined },
    transferMeta: { type: transferMetaSchema, default: undefined },
    adjustmentMeta: { type: adjustmentMetaSchema, default: undefined },
    source: { type: String, enum: TRANSACTION_SOURCES, required: true },
    bulkBatchId: { type: String, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    editCount: { type: Number, default: 0 },
    lastEditedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

transactionSchema.index({ userId: 1, transactionDate: -1 });
transactionSchema.index({ userId: 1, periodId: 1 });
transactionSchema.index({ userId: 1, jarId: 1 });
transactionSchema.index({ userId: 1, type: 1 });
transactionSchema.index({ bulkBatchId: 1 });

export const Transaction = mongoose.model("Transaction", transactionSchema);
