// Công nợ nội bộ và tự động trả nợ - US6.4.
import { InternalDebt } from "../models/InternalDebt.js";
import { DebtRepayment } from "../models/DebtRepayment.js";
import { Jar } from "../models/Jar.js";
import { AppError } from "../utils/AppError.js";
import { recordAllocatedIncome, recordDebtRepaymentStats } from "./jarPeriodStatService.js";

/**
 * Hàm thuần: lập kế hoạch trả nợ theo FIFO (nợ cũ nhất trước).
 * Không mutate input và không đụng DB, dùng chung cho preview + unit test.
 */
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
  {
    userId,
    debtorJarId,
    creditorJarId,
    amount,
    originTransferTransactionId,
  },
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
 * Chỉ đọc DB và lập preview; KHÔNG thay đổi công nợ.
 */
export async function repayOutstandingDebts(userId, incomeAmount, session) {
  let query = InternalDebt.find({
    userId,
    status: { $in: ["outstanding", "partially_repaid"] },
    remainingAmount: { $gt: 0 },
  }).sort({ createdAt: 1, _id: 1 });
  if (session) query = query.session(session);

  const debts = await query.lean();
  return calculateDebtRepaymentPlan(incomeAmount, debts);
}

/**
 * Apply kế hoạch đã preview sau khi Transaction[income] đã có id.
 * Tiền trả nợ được ghi nhận là income đi trực tiếp vào lọ chủ nợ, còn
 * debtRepayments giữ riêng trong incomeMeta để không lẫn với phần standard split.
 */
export async function applyDebtRepaymentPlan(
  {
    userId,
    repayments,
    incomeTransactionId,
    periodId,
    repaidAt = new Date(),
  },
  session,
) {
  const applied = [];

  for (const repayment of repayments) {
    const debt = await InternalDebt.findOne({
      _id: repayment.debtId,
      userId,
      status: { $in: ["outstanding", "partially_repaid"] },
    }).session(session ?? null);

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

    await Promise.all([
      Jar.updateOne(
        { _id: debt.creditorJarId, userId },
        { $inc: { balance: repayment.amount } },
        session ? { session } : undefined,
      ),
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
    ]);

    applied.push({ debtId: debt._id, amount: repayment.amount });
  }

  return applied;
}
