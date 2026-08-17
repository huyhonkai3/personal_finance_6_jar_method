// Cảnh báo ngưỡng chi tiêu 80%/90% - US4.1 / Giai đoạn 5.
import { JarPeriodStat } from "../models/JarPeriodStat.js";
import { Notification } from "../models/Notification.js";

export function calculatePercentageUsed(totalExpense, spendingLimit) {
  if (!Number.isFinite(spendingLimit) || spendingLimit <= 0) return null;
  return (totalExpense / spendingLimit) * 100;
}

export function getCrossedThresholds(percentageUsed, alertSent = {}) {
  if (percentageUsed === null || !Number.isFinite(percentageUsed)) return [];

  const thresholds = [];
  if (percentageUsed >= 80 && !alertSent.threshold80) thresholds.push(80);
  if (percentageUsed >= 90 && !alertSent.threshold90) thresholds.push(90);
  return thresholds;
}

function alertField(threshold) {
  return threshold === 90 ? "threshold90" : "threshold80";
}

export async function watchExpenseThreshold({
  userId,
  jarId,
  periodId,
  amount,
  session,
}) {
  if (!jarId || !amount) return { percentageUsed: null, notifications: [] };

  const stat = await JarPeriodStat.findOneAndUpdate(
    { userId, jarId, periodId },
    { $inc: { totalExpense: amount } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      session,
    },
  );

  const percentageUsed = calculatePercentageUsed(
    stat.totalExpense,
    stat.spendingLimit,
  );
  const crossed = getCrossedThresholds(percentageUsed, stat.alertSent);
  const notifications = [];

  for (const threshold of crossed) {
    const field = alertField(threshold);
    const claimed = await JarPeriodStat.findOneAndUpdate(
      { _id: stat._id, [`alertSent.${field}`]: { $ne: true } },
      { $set: { [`alertSent.${field}`]: true } },
      { new: true, session },
    );

    if (!claimed) continue;

    const [notification] = await Notification.create(
      [
        {
          userId,
          type: threshold === 90 ? "threshold_90" : "threshold_80",
          payload: {
            jarId,
            percentageUsed: Math.round(percentageUsed * 100) / 100,
          },
        },
      ],
      session ? { session } : undefined,
    );
    notifications.push(notification);
  }

  return { percentageUsed, notifications };
}
