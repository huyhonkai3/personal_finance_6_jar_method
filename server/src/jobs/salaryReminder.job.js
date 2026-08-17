// Cron quét user có settings.salaryDay = hôm nay -> tạo Notification(salary_reminder)
// Tham chiếu: US2.4 AC1
// Giai đoạn 4: chỉ implement HÀM chạy job (runSalaryReminderJob). Việc đăng
// ký lịch chạy thực sự bằng node-cron (jobs/scheduler.js) để dành Giai đoạn 6,
// khi scheduler.js được dựng chung cho cả job này lẫn autoSnapshot.job.js.
import { User } from "../models/User.js";
import { Notification } from "../models/Notification.js";

const SALARY_REMINDER_DEEP_LINK = "/input";

/**
 * Hàm THUẦN: user có nên nhận nhắc nhở lương vào `referenceDate` không, dựa
 * trên `salaryDay` đã cấu hình. Tách riêng để dễ unit test không cần DB.
 * @param {number | null | undefined} salaryDay - 1..31, null nếu chưa cấu hình
 * @param {Date} referenceDate
 */
export function isSalaryReminderDueTody(salaryDay, referenceDate) {
  if (!salaryDay) return false;
  return referenceDate.getDate() === salaryDay;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

/**
 * Quét toàn bộ user có `settings.salaryDay` = ngày hôm nay (theo
 * `referenceDate`), tạo Notification(salary_reminder) nếu HÔM NAY chưa gửi
 * cho user đó (tránh gửi lặp nếu job chạy nhiều lần/khởi động lại trong
 * cùng 1 ngày).
 *
 * @param {Date} [referenceDate] - mặc định là thời điểm hiện tại
 * @returns {Promise<number>} số Notification đã tạo mới
 */
export async function runSalaryReminderJob(referenceDate = new Date()) {
  const day = referenceDate.getDate();
  const users = await User.find({ "settings.salaryDay": day }).select("_id");

  if (users.length === 0) return 0;

  const todayStart = startOfDay(referenceDate);
  const todayEnd = endOfDay(referenceDate);

  let createdCount = 0;
  for (const user of users) {
    const alreadySent = await Notification.exists({
      userId: user._id,
      type: "salary_reminder",
      sentAt: { $gte: todayStart, $lte: todayEnd },
    });
    if (alreadySent) continue;

    await Notification.create({
      userId: user._id,
      type: "salary_reminder",
      payload: {},
      deepLink: SALARY_REMINDER_DEEP_LINK,
      sentAt: referenceDate,
    });
    createdCount += 1;
  }

  return createdCount;
}
