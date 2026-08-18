// POST /income/confirm — Standard Split / Targeted + debt repayment (G7).
import mongoose from "mongoose";

import { Jar } from "../models/Jar.js";
import { Transaction } from "../models/Transaction.js";
import { Notification } from "../models/Notification.js";
import { getOrCreateCurrentPeriod } from "../services/periodService.js";
import { allocateIncome } from "../services/allocationService.js";
import { applyDebtRepaymentPlan } from "../services/debtService.js";
import { adjustJarBalance } from "../services/jarBalanceService.js";
import { recordAllocatedIncome } from "../services/jarPeriodStatService.js";

export async function confirmIncome(req, res) {
  const { pendingIncome, incomeType, targetJarId, preview } = req.body;
  const { amount, description, rawText, transactionDate } = pendingIncome;
  const effectiveDate = transactionDate ?? new Date();

  const { allocations, ratioSnapshot, debtRepayments, remainingIncome } =
    await allocateIncome(req.userId, amount, incomeType, targetJarId);

  if (preview) {
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

  const period = await getOrCreateCurrentPeriod(req.userId, effectiveDate);
  const session = await mongoose.startSession();
  let transaction;

  try {
    await session.withTransaction(async () => {
      [transaction] = await Transaction.create(
        [
          {
            userId: req.userId,
            type: "income",
            amount,
            rawText: rawText ?? null,
            description,
            transactionDate: effectiveDate,
            periodId: period._id,
            jarId: incomeType === "targeted" ? targetJarId : null,
            source: rawText ? "realtime" : "manual",
            incomeMeta: {
              incomeType,
              ratioSnapshot,
              allocations,
              debtRepayments: debtRepayments.map(
                ({ debtId, amount: paid }) => ({
                  debtId,
                  amount: paid,
                }),
              ),
            },
          },
        ],
        { session },
      );

      if (debtRepayments.length > 0) {
        await applyDebtRepaymentPlan(
          {
            userId: req.userId,
            repayments: debtRepayments,
            incomeTransactionId: transaction._id,
            periodId: period._id,
            repaidAt: effectiveDate,
          },
          session,
        );
      }

      for (const allocation of allocations) {
        if (!allocation.amount) continue;
        await Promise.all([
          adjustJarBalance(allocation.jarId, allocation.amount, session),
          recordAllocatedIncome(
            req.userId,
            allocation.jarId,
            period._id,
            allocation.amount,
            session,
          ),
        ]);
      }

      if (debtRepayments.length > 0) {
        await Notification.create(
          [
            {
              userId: req.userId,
              type: "debt_repayment_applied",
              payload: {
                incomeTransactionId: transaction._id,
                totalAmount: debtRepayments.reduce(
                  (sum, repayment) => sum + repayment.amount,
                  0,
                ),
                repayments: debtRepayments.map(({ debtId, amount: paid }) => ({
                  debtId,
                  amount: paid,
                })),
              },
              deepLink: `/transactions/${transaction._id}`,
              sentAt: effectiveDate,
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
  res.status(201).json({ transaction, jars });
}
