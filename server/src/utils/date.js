// Tiện ích kỳ tài chính theo timezone của user.
// Không phụ thuộc timezone của máy chạy server: mọi mốc start/end được dựng
// từ calendar date trong timezone user rồi chuyển về UTC để lưu MongoDB.

const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addCalendarMonth(year, monthIndex, amount = 1) {
  const date = new Date(Date.UTC(year, monthIndex + amount, 1));
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
}

function normalizeTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function getZonedDateParts(date, timezone = DEFAULT_TIMEZONE) {
  const timeZone = normalizeTimezone(timezone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return {
    year: Number(value.year),
    month: Number(value.month),
    day: Number(value.day),
    hour: Number(value.hour),
    minute: Number(value.minute),
    second: Number(value.second),
  };
}

function getTimezoneOffsetMs(date, timezone) {
  const parts = getZonedDateParts(date, timezone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const dateWithoutMs = Math.floor(date.getTime() / 1000) * 1000;
  return representedAsUtc - dateWithoutMs;
}

function zonedDateTimeToUtc(
  { year, monthIndex, day, hour = 0, minute = 0, second = 0, millisecond = 0 },
  timezone,
) {
  const timeZone = normalizeTimezone(timezone);
  const localAsUtc = Date.UTC(
    year,
    monthIndex,
    day,
    hour,
    minute,
    second,
    millisecond,
  );

  let candidate = new Date(localAsUtc);
  let offset = getTimezoneOffsetMs(candidate, timeZone);
  candidate = new Date(localAsUtc - offset);

  // Chạy lại một lần để xử lý đúng các timezone có DST tại mốc chuyển giờ.
  const correctedOffset = getTimezoneOffsetMs(candidate, timeZone);
  if (correctedOffset !== offset) {
    candidate = new Date(localAsUtc - correctedOffset);
  }

  return candidate;
}

/**
 * Tính kỳ chứa referenceDate.
 * `monthEndDay` là ngày BẮT ĐẦU chu kỳ theo tên field đã chốt trong Data Model:
 * 1 => 01/tháng này đến hết ngày cuối tháng; 5 => 05/tháng này đến 04/tháng sau.
 */
export function getPeriodBounds(
  referenceDate,
  monthEndDay = 1,
  timezone = DEFAULT_TIMEZONE,
) {
  const zoned = getZonedDateParts(referenceDate, timezone);
  const currentMonthIndex = zoned.month - 1;
  const currentStartDay = Math.min(
    monthEndDay,
    daysInMonth(zoned.year, currentMonthIndex),
  );

  let startYear = zoned.year;
  let startMonthIndex = currentMonthIndex;
  if (zoned.day < currentStartDay) {
    const previous = addCalendarMonth(zoned.year, currentMonthIndex, -1);
    startYear = previous.year;
    startMonthIndex = previous.monthIndex;
  }

  const startDay = Math.min(
    monthEndDay,
    daysInMonth(startYear, startMonthIndex),
  );
  const startDate = zonedDateTimeToUtc(
    { year: startYear, monthIndex: startMonthIndex, day: startDay },
    timezone,
  );

  const nextMonth = addCalendarMonth(startYear, startMonthIndex, 1);
  const nextStartDay = Math.min(
    monthEndDay,
    daysInMonth(nextMonth.year, nextMonth.monthIndex),
  );
  const nextStartDate = zonedDateTimeToUtc(
    {
      year: nextMonth.year,
      monthIndex: nextMonth.monthIndex,
      day: nextStartDay,
    },
    timezone,
  );

  const endDate = new Date(nextStartDate.getTime() - 1);
  const periodKey = `${startYear}-${String(startMonthIndex + 1).padStart(2, "0")}`;

  return { startDate, endDate, periodKey };
}
