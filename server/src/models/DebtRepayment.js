// Lịch sử các lần tự động trả nợ từ income - US6.4.
import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const debtRepaymentSchema = new mongoose.Schema({
  userId: { type: ObjectId, ref: "User", required: true, index: true },
  debtId: { type: ObjectId, ref: "InternalDebt", required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  incomeTransactionId: {
    type: ObjectId,
    ref: "Transaction",
    required: true,
  },
  repaidAt: { type: Date, default: Date.now },
});

debtRepaymentSchema.index({ userId: 1, debtId: 1, repaidAt: -1 });

export const DebtRepayment = mongoose.model("DebtRepayment", debtRepaymentSchema);
