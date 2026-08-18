// POST /income/confirm — Standard Split / Targeted + debt repayment.
import mongoose from "mongoose";

import { Jar } from "../models/Jar.js";
import { TransactionHistory } from "../models/TransactionHistory.js";
import { allocateIncome } from "../services/allocationService.js";
import { createIncomeTransaction } from "../services/incomeService.js";
import { recalculateFromPeriod } from "../services/recalculationEngine.js";

export async function confirmIncome(req, res) {
  const { pendingIncome, incomeType, targetJarId, preview } = req.body;
  const { amount, description, rawText, transactionDate } = pendingIncome;
  const effectiveDate = transactionDate ?? new Date();

  if (preview) {
    const { allocations, ratioSnapshot, debtRepayments, remainingIncome } =
      await allocateIncome(
        req.userId,
        amount,
        incomeType,
        targetJarId,
        undefined,
        effectiveDate,
      );

    return res.status(200).json({
      preview: {
        amount,
        debtRepayments,
        totalDebtRepayment: debtRepayments.reduce(
          (sum, repayment) => sum + repayment.amount,
          0,
        ),
        remainingIncome,
        allocations,
        ratioSnapshot,
      },
    });
  }

  const session = await mongoose.startSession();
  let result;
  let recalc = {
    affectedPeriodIds: [],
    createdAdjustmentTransactionIds: [],
  };

  try {
    await session.withTransaction(async () => {
      result = await createIncomeTransaction(
        {
          userId: req.userId,
          amount,
          description,
          rawText: rawText ?? null,
          transactionDate: effectiveDate,
          incomeType,
          targetJarId,
          source: rawText ? "realtime" : "manual",
        },
        session,
      );

      if (result.period.status !== "open") {
        recalc = await recalculateFromPeriod(
          {
            userId: req.userId,
            periodId: result.period._id,
            sourceTransactionId: result.transaction._id,
          },
          session,
        );

        await TransactionHistory.create(
          [
            {
              userId: req.userId,
              transactionId: result.transaction._id,
              changeType: "create",
              diff: [
                {
                  field: "lateBackfill",
                  oldValue: null,
                  newValue: effectiveDate,
                },
              ],
              triggeredRecalc: recalc.affectedPeriodIds.length > 0,
              affectedPeriodIds: recalc.affectedPeriodIds,
              createdAdjustmentTransactionIds:
                recalc.createdAdjustmentTransactionIds,
              changedAt: new Date(),
            },
          ],
          { session },
        );
      }
    });
  } finally {
    await session.endSession();
  }

  const jars = await Jar.find({ userId: req.userId }).sort({ order: 1 });
  res.status(201).json({
    transaction: result.transaction,
    jars,
    recalc: {
      affectedPeriodIds: recalc.affectedPeriodIds,
      adjustmentsCreated: recalc.createdAdjustmentTransactionIds,
    },
  });
}
