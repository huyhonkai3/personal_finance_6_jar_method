// Ham xu ly ngay gio theo timezone user (mac dinh Asia/Ho_Chi_Minh),
// tinh moc 23:59 cuoi ky (dung date-fns)
//
// Giai đoạn 2 chỉ cần đủ để suy ra periodKey/startDate/endDate cho 1
// transactionDate (dùng bởi periodService#getOrCreateCurrentPeriod). Việc
// tính mốc 23:59 CHÍNH XÁC theo timezone của user (để cron Auto-Snapshot
// chạy đúng giờ) là việc của Giai đoạn 6 - hàm bên dưới dùng giờ hệ thống
// (server local time) làm xấp xỉ, đủ dùng để xác định periodId ở giai đoạn
// hiện tại.
import {
  addMonths,
  endOfDay,
  getDaysInMonth,
  setDate,
  startOfDay,
  subDays,
} from "date-fns";

function clampDayToMonth(date, day) {
  return Math.min(day, getDaysInMonth(date));
}

/**
 * Tính khoảng thời gian (startDate -> endDate) và periodKey của kỳ tài
 * chính chứa `referenceDate`, dựa trên `monthEndDay` (ngày bắt đầu chu kỳ
 * hằng tháng - tên field kế thừa theo Data Model, xem User.settings.monthEndDay).
 *
 * Ví dụ monthEndDay = 1: kỳ trùng với tháng dương lịch (01/08 -> 31/08).
 * Ví dụ monthEndDay = 5 (ngày lương): kỳ chạy từ 05/08 -> 04/09.
 *
 * @param {Date} referenceDate
 * @param {number} monthEndDay - 1..31, mặc định 1
 * @returns {{ startDate: Date, endDate: Date, periodKey: string }}
 */
export function getPeriodBounds(referenceDate, monthEndDay = 1) {
  const day = referenceDate.getDate();

  let cycleStartMonth = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1,
  );

  if (day < monthEndDay) {
    // referenceDate chưa tới mốc bắt đầu chu kỳ của tháng này -> kỳ hiện tại
    // thực ra đã bắt đầu từ tháng trước.
    cycleStartMonth = addMonths(cycleStartMonth, -1);
  }

  const startDate = startOfDay(
    setDate(cycleStartMonth, clampDayToMonth(cycleStartMonth, monthEndDay)),
  );

  const nextCycleStartMonth = addMonths(cycleStartMonth, 1);
  const nextStartDate = startOfDay(
    setDate(
      nextCycleStartMonth,
      clampDayToMonth(nextCycleStartMonth, monthEndDay),
    ),
  );

  const endDate = endOfDay(subDays(nextStartDate, 1));

  const periodKey = `${startDate.getFullYear()}-${String(
    startDate.getMonth() + 1,
  ).padStart(2, "0")}`;

  return { startDate, endDate, periodKey };
}
