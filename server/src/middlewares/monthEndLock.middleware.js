// Khóa các thao tác ghi khi user còn kỳ pending_close.
// Whitelist theo Backend Plan: transaction input và endpoint xử lý close.
import { FinancialPeriod } from "../models/FinancialPeriod.js";
import { AppError } from "../utils/AppError.js";
import { snapshotDuePeriodsForUser } from "../services/periodService.js";

const WRITE_METHODS = new Set(["POST", "PATCH", "DELETE"]);

export function isMonthEndWriteWhitelisted(method, path) {
  if (!WRITE_METHODS.has(method)) return true;
  if (path === "/transactions" || path.startsWith("/transactions/"))
    return true;
  if (method === "POST" && /^\/periods\/[0-9a-fA-F]{24}\/close$/.test(path)) {
    return true;
  }
  return false;
}

export async function monthEndLock(req, _res, next) {
  if (!req.userId || !WRITE_METHODS.has(req.method)) return next();
  if (isMonthEndWriteWhitelisted(req.method, req.path)) return next();

  // Defensive catch-up: nếu cron vừa trễ hoặc server vừa khởi động lại sau
  // mốc endDate, request ghi đầu tiên vẫn materialize snapshot trước khi check.
  await snapshotDuePeriodsForUser(req.userId, new Date());

  const pending = await FinancialPeriod.findOne({
    userId: req.userId,
    status: "pending_close",
  }).sort({ endDate: 1 });

  if (pending) {
    throw new AppError(
      423,
      "MONTH_END_PENDING",
      "Cần hoàn tất Chốt tháng trước khi thực hiện thao tác này",
      { periodId: pending._id },
    );
  }

  return next();
}
