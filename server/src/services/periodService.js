// Xác định/khởi tạo "kỳ tài chính hiện tại" (FinancialPeriod) cho 1
// transactionDate - nền tảng bắt buộc dùng ở mọi nơi cần periodId
// (Transaction Engine từ Giai đoạn 3 trở đi).
//
// Giai đoạn 2: chỉ cần tìm-hoặc-tạo đúng FinancialPeriod, CHƯA xử lý
// snapshot/close (status luôn 'open' khi mới tạo) - việc đó dành cho Giai
// đoạn 6 (Auto-Snapshot, xu ly Modal Chốt tháng rollover/sweep).
// Tham chiếu: US4.2, US4.3 (chỉ phần nền tảng)
import { User } from "../models/User.js";
import { FinancialPeriod } from "../models/FinancialPeriod.js";
import { getPeriodBounds } from "../utils/date.js";

const DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Trả về (tạo mới nếu chưa có) FinancialPeriod chứa `transactionDate` của
 * user. Dùng ở mọi nơi cần suy ra `periodId` cho 1 Transaction.
 *
 * @param {import("mongoose").Types.ObjectId | string} userId
 * @param {Date} [transactionDate] - mặc định là thời điểm hiện tại
 * @returns {Promise<import("mongoose").Document>} FinancialPeriod document
 */
export async function getOrCreateCurrentPeriod(
  userId,
  transactionDate = new Date(),
) {
  const user = await User.findById(userId).select("settings.monthEndDay");
  const monthEndDay = user?.settings?.monthEndDay ?? 1;

  const { startDate, endDate, periodKey } = getPeriodBounds(
    transactionDate,
    monthEndDay,
  );

  const existing = await FinancialPeriod.findOne({ userId, periodKey });
  if (existing) {
    return existing;
  }

  try {
    return await FinancialPeriod.create({
      userId,
      periodKey,
      startDate,
      endDate,
      status: "open",
    });
  } catch (err) {
    // Race condition: 2 request cùng lúc cùng tạo kỳ đầu tiên cho 1 user
    // (VD auto-snapshot job và 1 request nhập liệu chạy gần như đồng thời).
    // Unique index { userId, periodKey } sẽ chặn bản ghi trùng - trong
    // trường hợp đó, chỉ cần đọc lại bản ghi đã được tạo bởi request kia.
    if (err?.code === DUPLICATE_KEY_ERROR_CODE) {
      const period = await FinancialPeriod.findOne({ userId, periodKey });
      if (period) return period;
    }
    throw err;
  }
}
