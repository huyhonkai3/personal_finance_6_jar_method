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

// Dùng khi một expense đã tồn tại được chuyển sang lọ khác. Việc tạo expense
// mới đi qua thresholdWatcher để vừa cộng totalExpense vừa kiểm tra ngưỡng.
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
