// GET /periods/current, GET /periods/:id/summary, POST /periods/:id/close — muc 13
import { FinancialPeriod } from "../models/FinancialPeriod.js";
import {
  closeFinancialPeriod,
  getOrCreateCurrentPeriod,
  getPeriodSummary,
  snapshotDuePeriodsForUser,
} from "../services/periodService.js";

export async function getCurrentPeriod(req, res) {
  const now = new Date();

  // Catch-up ngay khi user mở app: nếu scheduler từng ngừng/chạy trễ thì
  // endpoint này vẫn biến kỳ quá hạn thành pending_close trước khi trả state.
  await snapshotDuePeriodsForUser(req.userId, now);

  const [currentPeriod, pendingPeriod] = await Promise.all([
    getOrCreateCurrentPeriod(req.userId, now),
    FinancialPeriod.findOne({
      userId: req.userId,
      status: "pending_close",
    }).sort({ endDate: 1 }),
  ]);

  res.status(200).json({
    currentPeriod,
    hasPendingClose: Boolean(pendingPeriod),
    pendingPeriod,
  });
}

export async function getPeriodSummaryController(req, res) {
  const summary = await getPeriodSummary(req.userId, req.params.id);
  res.status(200).json(summary);
}

export async function closePeriod(req, res) {
  const result = await closeFinancialPeriod(
    req.userId,
    req.params.id,
    req.body.decisions,
  );
  res.status(200).json(result);
}
