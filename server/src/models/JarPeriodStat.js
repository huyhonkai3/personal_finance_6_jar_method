// Số liệu theo từng lọ trong từng kỳ.
import mongoose from "mongoose";

export const CLOSE_DECISIONS = ["rollover", "sweep"];

const jarPeriodStatSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jarId: { type: mongoose.Schema.Types.ObjectId, ref: "Jar", required: true },
    periodId: { type: mongoose.Schema.Types.ObjectId, ref: "FinancialPeriod", required: true },
    openingBalance: { type: Number, default: 0 },
    allocatedIncome: { type: Number, default: 0 },
    totalExpense: { type: Number, default: 0 },
    totalTransferIn: { type: Number, default: 0 },
    totalTransferOut: { type: Number, default: 0 },
    totalDebtRepaymentIn: { type: Number, default: 0 },
    totalDebtRepaymentOut: { type: Number, default: 0 },
    totalAdjustment: { type: Number, default: 0 },
    closingBalance: { type: Number, default: null },
    spendingLimit: { type: Number, default: 0 },
    alertSent: {
      threshold80: { type: Boolean, default: false },
      threshold90: { type: Boolean, default: false },
    },
    closeDecision: { type: String, enum: CLOSE_DECISIONS, default: null },
    closeDecisionAmount: { type: Number, default: null },
  },
  { timestamps: true },
);

jarPeriodStatSchema.index({ userId: 1, jarId: 1, periodId: 1 }, { unique: true });
jarPeriodStatSchema.index({ userId: 1, periodId: 1 });

export const JarPeriodStat = mongoose.model("JarPeriodStat", jarPeriodStatSchema);
