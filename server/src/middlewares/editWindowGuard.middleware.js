// Giới hạn sửa/xóa/backdate trong 12 tháng gần nhất - US5.5.
import { User } from "../models/User.js";
import { Transaction } from "../models/Transaction.js";
import { AppError } from "../utils/AppError.js";
import { getPeriodBounds, getZonedDateParts } from "../utils/date.js";

function getCandidateDate(req) {
  return (
    req.body?.transactionDate ??
    req.body?.pendingExpense?.transactionDate ??
    req.body?.pendingIncome?.transactionDate ??
    null
  );
}

export function calculateEditWindowStart(
  now = new Date(),
  timezone = "Asia/Ho_Chi_Minh",
) {
  const current = getZonedDateParts(now, timezone);
  const reference = new Date(
    Date.UTC(current.year, current.month - 1 - 11, 15, 12, 0, 0),
  );
  return getPeriodBounds(reference, 1, timezone).startDate;
}

export function isWithinEditWindow(
  transactionDate,
  now = new Date(),
  timezone = "Asia/Ho_Chi_Minh",
) {
  const date = new Date(transactionDate);
  if (Number.isNaN(date.getTime())) return false;
  return date >= calculateEditWindowStart(now, timezone) && date <= now;
}

function throwExceeded(now, timezone) {
  throw new AppError(
    403,
    "EDIT_WINDOW_EXCEEDED",
    "Giao dịch đã nằm ngoài phạm vi 12 tháng được phép chỉnh sửa",
    { editWindowStart: calculateEditWindowStart(now, timezone) },
  );
}

export async function editWindowGuard(req, _res, next) {
  const requestedDate = getCandidateDate(req);
  let transaction = null;

  if (req.params?.id) {
    transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.userId,
      isDeleted: false,
    });
    if (!transaction) {
      throw new AppError(
        404,
        "TRANSACTION_NOT_FOUND",
        "Không tìm thấy giao dịch",
      );
    }
    req.editWindowTransaction = transaction;
  }

  const user = await User.findById(req.userId).select("settings.timezone");
  const timezone = user?.settings?.timezone ?? "Asia/Ho_Chi_Minh";
  const now = new Date();

  // Không cho phép "cứu" một transaction đã quá hạn bằng cách PATCH ngày của
  // nó về hiện tại: bản ghi gốc và ngày đích mới đều phải nằm trong cửa sổ.
  if (
    transaction &&
    !isWithinEditWindow(transaction.transactionDate, now, timezone)
  ) {
    throwExceeded(now, timezone);
  }

  const candidateDate = requestedDate ?? transaction?.transactionDate ?? now;
  if (!isWithinEditWindow(candidateDate, now, timezone)) {
    throwExceeded(now, timezone);
  }

  next();
}
