// Persist Income dùng chung cho realtime confirm và bulk-input.
import { Notification } from "../models/Notification.js";
import { Transaction } from "../models/Transaction.js";
import { allocateIncome } from "./allocationService.js";
import { applyDebtRepaymentPlan } from "./debtService.js";
import { adjustJarBalance } from "./jarBalanceService.js";
import { recordAllocatedIncome } from "./jarPeriodStatService.js";
import { getOrCreateCurrentPeriod } from "./periodService.js";

export async function createIncomeTransaction(
  {
    userId,
    amount,
    description = "",
    rawText = null,
    transactionDate = new Date(),
    incomeType = "standard_split",
    targetJarId,
    source = "manual",
    bulkBatchId = null,
  },
  session,
) {
  const period = await getOrCreateCurrentPeriod(userId, transactionDate, session);
  const isHistorical = period.status !== "open";
  const { allocations, ratioSnapshot, debtRepayments, remainingIncome } =
    await allocateIncome(
      userId,
      amount,
      incomeType,
      targetJarId,
      session,
      transactionDate,
    );

  const [transaction] = await Transaction.create(
    [
      {
        userId,
        type: "income",
        amount,
        rawText,
        description,
        transactionDate,
        periodId: period._id,
        jarId: incomeType === "targeted" ? targetJarId : null,
        source,
        bulkBatchId,
        incomeMeta: {
          incomeType,
          ratioSnapshot,
          allocations,
          debtRepayments: debtRepayments.map(({ debtId, amount: paid }) => ({
            debtId,
            amount: paid,
          })),
        },
      },
    ],
    session ? { session } : undefined,
  );

  if (debtRepayments.length > 0) {
    await applyDebtRepaymentPlan(
      {
        userId,
        repayments: debtRepayments,
        incomeTransactionId: transaction._id,
        periodId: period._id,
        repaidAt: transactionDate,
        applyLiveBalance: !isHistorical,
      },
      session,
    );
  }

  for (const allocation of allocations) {
    if (!allocation.amount) continue;

    const operations = [
      recordAllocatedIncome(
        userId,
        allocation.jarId,
        period._id,
        allocation.amount,
        session,
      ),
    ];
    if (!isHistorical) {
      operations.push(
        adjustJarBalance(allocation.jarId, allocation.amount, session),
      );
    }
    await Promise.all(operations);
  }

  if (debtRepayments.length > 0) {
    await Notification.create(
      [
        {
          userId,
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
          sentAt: transactionDate,
        },
      ],
      session ? { session } : undefined,
    );
  }

  return {
    transaction,
    period,
    allocations,
    ratioSnapshot,
    debtRepayments,
    remainingIncome,
  };
}
