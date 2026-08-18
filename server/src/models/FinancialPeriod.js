// Mongoose schema: FinancialPeriod
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
    periodKey: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: PERIOD_STATUSES, default: "open" },
    snapshotAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

financialPeriodSchema.index({ userId: 1, periodKey: 1 }, { unique: true });
financialPeriodSchema.index({ userId: 1, status: 1 });

export const FinancialPeriod = mongoose.model(
  "FinancialPeriod",
  financialPeriodSchema,
);
