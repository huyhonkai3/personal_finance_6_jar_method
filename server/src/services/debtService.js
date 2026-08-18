// Công nợ nội bộ và tự động trả nợ - US6.4.
import { InternalDebt } from "../models/InternalDebt.js";
import { DebtRepayment } from "../models/DebtRepayment.js";
import { Jar } from "../models/Jar.js";
import { AppError } from "../utils/AppError.js";
import {
  recordAllocatedIncome,
  recordDebtRepaymentStats,
} from "./jarPeriodStatService.js";

export function calculateDebtRepaymentPlan(incomeAmount, debts) {
  let remainingIncome = Math.max(0, incomeAmount);
  const ordered = [...debts].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const repayments = [];

  for (const debt of ordered) {
    if (remainingIncome <= 0) break;
    const remainingDebt = Math.max(0, debt.remainingAmount ?? 0);
    if (remainingDebt === 0) continue;

    const amount = Math.min(remainingIncome, remainingDebt);
    repayments.push({
      debtId: debt._id,
      debtorJarId: debt.debtorJarId,
      creditorJarId: debt.creditorJarId,
      amount,
    });
    remainingIncome -= amount;
  }

  return { repayments, remainingIncome };
}

export async function createDebt(
  { userId, debtorJarId, creditorJarId, amount, originTransferTransactionId },
  session,
) {
  const [debt] = await InternalDebt.create(
    [
      {
        userId,
        debtorJarId,
        creditorJarId,
        originalAmount: amount,
        remainingAmount: amount,
        status: "outstanding",
        originTransferTransactionId,
      },
    ],
    session ? { session } : undefined,
  );
  return debt;
}

/**
 * Chỉ đọc DB và lập kế hoạch. `asOf` dùng cho backfill: một Income lịch sử
 * không được trả khoản nợ được tạo sau ngày Income đó.
 */
export async function repayOutstandingDebts(
  userId,
  incomeAmount,
  session,
  asOf,
) {
  const filter = {
    userId,
    status: { $in: ["outstanding", "partially_repaid"] },
    remainingAmount: { $gt: 0 },
  };
  if (asOf) filter.createdAt = { $lte: asOf };

  let query = InternalDebt.find(filter).sort({ createdAt: 1, _id: 1 });
  if (session) query = query.session(session);

  const debts = await query.lean();
  return calculateDebtRepaymentPlan(incomeAmount, debts);
}

/**
 * `applyLiveBalance=false` dùng cho historical backfill: công nợ và số liệu
 * của kỳ lịch sử vẫn được cập nhật, nhưng Jar.balance hiện tại không được cộng
 * trực tiếp; Recalculation Engine sẽ tạo Adjustment ở kỳ hiện tại.
 */
export async function applyDebtRepaymentPlan(
  {
    userId,
    repayments,
    incomeTransactionId,
    periodId,
    repaidAt = new Date(),
    applyLiveBalance = true,
  },
  session,
) {
  const applied = [];

  for (const repayment of repayments) {
    let debtQuery = InternalDebt.findOne({
      _id: repayment.debtId,
      userId,
      status: { $in: ["outstanding", "partially_repaid"] },
    });
    if (session) debtQuery = debtQuery.session(session);
    const debt = await debtQuery;

    if (!debt || debt.remainingAmount < repayment.amount) {
      throw new AppError(
        409,
        "DEBT_STATE_CHANGED",
        "Công nợ đã thay đổi, vui lòng xem lại phân bổ thu nhập",
      );
    }

    debt.remainingAmount -= repayment.amount;
    debt.status = debt.remainingAmount === 0 ? "settled" : "partially_repaid";
    await debt.save(session ? { session } : undefined);

    await DebtRepayment.create(
      [
        {
          userId,
          debtId: debt._id,
          amount: repayment.amount,
          incomeTransactionId,
          repaidAt,
        },
      ],
      session ? { session } : undefined,
    );

    const operations = [
      recordAllocatedIncome(
        userId,
        debt.creditorJarId,
        periodId,
        repayment.amount,
        session,
      ),
      recordDebtRepaymentStats(
        userId,
        debt.debtorJarId,
        debt.creditorJarId,
        periodId,
        repayment.amount,
        session,
      ),
    ];

    if (applyLiveBalance) {
      operations.push(
        Jar.updateOne(
          { _id: debt.creditorJarId, userId },
          { $inc: { balance: repayment.amount } },
          session ? { session } : undefined,
        ),
      );
    }

    await Promise.all(operations);
    applied.push({ debtId: debt._id, amount: repayment.amount });
  }

  return applied;
}
