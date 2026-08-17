// Cập nhật JarPeriodStat theo từng lọ/kỳ - bắt đầu dùng từ Giai đoạn 4 khi có thu nhập mới
// (allocatedIncome). Các field khác (totalExpense, closingBalance...) sẽ được các giai đoạn sau
// (5 - threshold, 6 - chốt tháng, 8 - recalculation) cập nhật tiếp.
import { JarPeriodStat } from "../models/JarPeriodStat.js";

/**
 * Ghi nhận 1 khoản thu nhập vừa phân bổ vào lọ - cộng dồn vào
 * `allocatedIncome` VÀ `spendingLimit` (= openingBalance + allocatedIncome,
 * đúng công thức ở Data Model muc 3.4) của đúng (jarId, periodId). Tự tạo
 * document JarPeriodStat nếu đây là lần đầu lọ này có phát sinh trong kỳ
 * (upsert) - các field còn lại dùng default của schema.
 *
 * @param {import("mongoose").Types.ObjectId | string} userId
 * @param {import("mongoose").Types.ObjectId | string} jarId
 * @param {import("mongoose").Types.ObjectId | string} periodId
 * @param {number} amount
 * @param {import("mongoose").ClientSession} [session]
 */
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
