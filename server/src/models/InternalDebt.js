// Công nợ nội bộ giữa hai lọ - US6.4.
import mongoose from "mongoose";

export const DEBT_STATUSES = ["outstanding", "partially_repaid", "settled"];
const { ObjectId } = mongoose.Schema.Types;

const internalDebtSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true, index: true },
    debtorJarId: { type: ObjectId, ref: "Jar", required: true },
    creditorJarId: { type: ObjectId, ref: "Jar", required: true },
    originalAmount: { type: Number, required: true, min: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: DEBT_STATUSES,
      default: "outstanding",
      index: true,
    },
    originTransferTransactionId: {
      type: ObjectId,
      ref: "Transaction",
      required: true,
    },
  },
  { timestamps: true },
);

internalDebtSchema.index({ userId: 1, status: 1, createdAt: 1 });
internalDebtSchema.index({ debtorJarId: 1 });
internalDebtSchema.index({ creditorJarId: 1 });

export const InternalDebt = mongoose.model("InternalDebt", internalDebtSchema);
