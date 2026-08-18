// Cron nhắc ngày lương theo timezone từng user - US2.4 AC1.
import { User } from "../models/User.js";
import { Notification } from "../models/Notification.js";
import { getZonedDateParts } from "../utils/date.js";

const SALARY_REMINDER_DEEP_LINK = "/input";
const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

export function isSalaryReminderDueToday(
  salaryDay,
  referenceDate,
  timezone = DEFAULT_TIMEZONE,
) {
  if (!salaryDay) return false;
  return getZonedDateParts(referenceDate, timezone).day === salaryDay;
}

// Giữ alias cũ để không làm vỡ test/import đã tồn tại từ Giai đoạn 4.
export const isSalaryReminderDueTody = isSalaryReminderDueToday;

function isSameZonedCalendarDay(first, second, timezone) {
  const a = getZonedDateParts(first, timezone);
  const b = getZonedDateParts(second, timezone);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export async function runSalaryReminderJob(referenceDate = new Date()) {
  const users = await User.find({
    "settings.salaryDay": { $ne: null },
  }).select("_id settings.salaryDay settings.timezone");

  let createdCount = 0;
  for (const user of users) {
    const timezone = user.settings?.timezone ?? DEFAULT_TIMEZONE;
    if (
      !isSalaryReminderDueToday(
        user.settings?.salaryDay,
        referenceDate,
        timezone,
      )
    ) {
      continue;
    }

    const latest = await Notification.findOne({
      userId: user._id,
      type: "salary_reminder",
    })
      .sort({ sentAt: -1 })
      .select("sentAt");

    if (
      latest &&
      isSameZonedCalendarDay(latest.sentAt, referenceDate, timezone)
    ) {
      continue;
    }

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
