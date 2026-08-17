// Cập nhật JarPeriodStat theo từng lọ/kỳ.
import { JarPeriodStat } from "../models/JarPeriodStat.js";

export async function recordAllocatedIncome(
  userId,
  jarId,
  periodId,
  amount,
  session,
) {
  if (!amount) return;
  await JarPeriodStat.updateOne(
    { userId, jarId, periodId },
    { $inc: { allocatedIncome: amount, spendingLimit: amount } },
    { upsert: true, setDefaultsOnInsert: true, session },
  );
}

export async function adjustTotalExpense(
  userId,
  jarId,
  periodId,
  amountDelta,
  session,
) {
  if (!jarId || !amountDelta) return;
  await JarPeriodStat.updateOne(
    { userId, jarId, periodId },
    { $inc: { totalExpense: amountDelta } },
    { upsert: true, setDefaultsOnInsert: true, session },
  );
}

export async function recordTransfer(
  userId,
  fromJarId,
  toJarId,
  periodId,
  amount,
  session,
) {
  if (!amount) return;
  await Promise.all([
    JarPeriodStat.updateOne(
      { userId, jarId: fromJarId, periodId },
      { $inc: { totalTransferOut: amount } },
      { upsert: true, setDefaultsOnInsert: true, session },
    ),
    JarPeriodStat.updateOne(
      { userId, jarId: toJarId, periodId },
      { $inc: { totalTransferIn: amount } },
      { upsert: true, setDefaultsOnInsert: true, session },
    ),
  ]);
}

export async function recordDebtRepaymentStats(
  userId,
  debtorJarId,
  creditorJarId,
  periodId,
  amount,
  session,
) {
  if (!amount) return;
  await Promise.all([
    JarPeriodStat.updateOne(
      { userId, jarId: debtorJarId, periodId },
      { $inc: { totalDebtRepaymentOut: amount } },
      { upsert: true, setDefaultsOnInsert: true, session },
    ),
    JarPeriodStat.updateOne(
      { userId, jarId: creditorJarId, periodId },
      { $inc: { totalDebtRepaymentIn: amount } },
      { upsert: true, setDefaultsOnInsert: true, session },
    ),
  ]);
}
