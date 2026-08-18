// Nghiệp vụ Financial Period: xác định kỳ, Auto-Snapshot và Chốt tháng.
import mongoose from "mongoose";

import { User } from "../models/User.js";
import { Jar } from "../models/Jar.js";
import { FinancialPeriod } from "../models/FinancialPeriod.js";
import { JarPeriodStat } from "../models/JarPeriodStat.js";
import { Notification } from "../models/Notification.js";
import { AppError } from "../utils/AppError.js";
import { getPeriodBounds } from "../utils/date.js";

const DUPLICATE_KEY_ERROR_CODE = 11000;

export function calculateClosingBalance(stat = {}) {
  return (
    (stat.openingBalance ?? 0) +
    (stat.allocatedIncome ?? 0) -
    (stat.totalExpense ?? 0) +
    (stat.totalTransferIn ?? 0) -
    (stat.totalTransferOut ?? 0) +
    (stat.totalAdjustment ?? 0)
  );
}

async function getUserPeriodSettings(userId, session) {
  let query = User.findById(userId).select(
    "settings.monthEndDay settings.timezone",
  );
  if (session) query = query.session(session);
  const user = await query;
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "Không tìm thấy người dùng");
  }
  return {
    monthEndDay: user.settings?.monthEndDay ?? 1,
    timezone: user.settings?.timezone ?? "Asia/Ho_Chi_Minh",
  };
}

export async function getOrCreateCurrentPeriod(
  userId,
  transactionDate = new Date(),
  session,
) {
  const { monthEndDay, timezone } = await getUserPeriodSettings(
    userId,
    session,
  );
  const { startDate, endDate, periodKey } = getPeriodBounds(
    transactionDate,
    monthEndDay,
    timezone,
  );

  let existingQuery = FinancialPeriod.findOne({ userId, periodKey });
  if (session) existingQuery = existingQuery.session(session);
  const existing = await existingQuery;
  if (existing) return existing;

  try {
    if (session) {
      const [period] = await FinancialPeriod.create(
        [{ userId, periodKey, startDate, endDate, status: "open" }],
        { session },
      );
      return period;
    }
    return await FinancialPeriod.create({
      userId,
      periodKey,
      startDate,
      endDate,
      status: "open",
    });
  } catch (err) {
    if (err?.code === DUPLICATE_KEY_ERROR_CODE) {
      let retryQuery = FinancialPeriod.findOne({ userId, periodKey });
      if (session) retryQuery = retryQuery.session(session);
      const period = await retryQuery;
      if (period) return period;
    }
    throw err;
  }
}

export async function snapshotPeriod(period, referenceDate = new Date()) {
  if (!period || period.status !== "open" || period.endDate > referenceDate) {
    return null;
  }

  const olderPending = await FinancialPeriod.exists({
    userId: period.userId,
    status: "pending_close",
    endDate: { $lt: period.endDate },
  });
  if (olderPending) return null;

  const jars = await Jar.find({ userId: period.userId }).sort({ order: 1 });
  const stats = await JarPeriodStat.find({
    userId: period.userId,
    periodId: period._id,
  });
  const statByJar = new Map(stats.map((stat) => [String(stat.jarId), stat]));

  for (const jar of jars) {
    const current = statByJar.get(String(jar._id));
    await JarPeriodStat.updateOne(
      { userId: period.userId, jarId: jar._id, periodId: period._id },
      {
        $set: { closingBalance: calculateClosingBalance(current ?? {}) },
        $setOnInsert: { openingBalance: 0, spendingLimit: 0 },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  const claimed = await FinancialPeriod.findOneAndUpdate(
    { _id: period._id, status: "open", endDate: { $lte: referenceDate } },
    { $set: { status: "pending_close", snapshotAt: period.endDate } },
    { new: true },
  );
  if (!claimed) return null;

  const nextPeriod = await getOrCreateCurrentPeriod(
    period.userId,
    new Date(period.endDate.getTime() + 1),
  );

  const alreadyNotified = await Notification.exists({
    userId: period.userId,
    type: "month_end_pending",
    "payload.periodId": period._id,
  });
  if (!alreadyNotified) {
    await Notification.create({
      userId: period.userId,
      type: "month_end_pending",
      payload: { periodId: period._id },
      deepLink: `/periods/${period._id}/summary`,
      sentAt: referenceDate,
    });
  }

  return { period: claimed, nextPeriod };
}

export async function snapshotDuePeriods(referenceDate = new Date()) {
  const due = await FinancialPeriod.find({
    status: "open",
    endDate: { $lte: referenceDate },
  }).sort({ endDate: 1 });

  let snapshotCount = 0;
  for (const period of due) {
    if (await snapshotPeriod(period, referenceDate)) snapshotCount += 1;
  }
  return snapshotCount;
}

export async function snapshotDuePeriodsForUser(
  userId,
  referenceDate = new Date(),
) {
  const due = await FinancialPeriod.find({
    userId,
    status: "open",
    endDate: { $lte: referenceDate },
  }).sort({ endDate: 1 });

  let snapshotCount = 0;
  for (const period of due) {
    if (await snapshotPeriod(period, referenceDate)) snapshotCount += 1;
  }
  return snapshotCount;
}

export async function getPeriodSummary(userId, periodId) {
  const period = await FinancialPeriod.findOne({ _id: periodId, userId });
  if (!period) {
    throw new AppError(404, "PERIOD_NOT_FOUND", "Không tìm thấy kỳ tài chính");
  }

  const jars = await Jar.find({ userId }).sort({ order: 1 });
  const stats = await JarPeriodStat.find({ userId, periodId });
  const statByJar = new Map(stats.map((stat) => [String(stat.jarId), stat]));

  return {
    period,
    jars: jars.map((jar) => {
      const stat = statByJar.get(String(jar._id));
      return {
        jarId: jar._id,
        key: jar.key,
        displayName: jar.displayName,
        openingBalance: stat?.openingBalance ?? 0,
        allocatedIncome: stat?.allocatedIncome ?? 0,
        totalExpense: stat?.totalExpense ?? 0,
        closingBalance:
          stat?.closingBalance ?? calculateClosingBalance(stat ?? {}),
        closeDecision: stat?.closeDecision ?? null,
        closeDecisionAmount: stat?.closeDecisionAmount ?? null,
      };
    }),
  };
}

export async function closeFinancialPeriod(userId, periodId, decisions) {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const period = await FinancialPeriod.findOne({
        _id: periodId,
        userId,
        status: "pending_close",
      }).session(session);
      if (!period) {
        throw new AppError(
          409,
          "PERIOD_NOT_PENDING_CLOSE",
          "Kỳ tài chính không ở trạng thái chờ chốt",
        );
      }

      const jars = await Jar.find({ userId })
        .sort({ order: 1 })
        .session(session);
      const jarIds = new Set(jars.map((jar) => String(jar._id)));
      const decisionByJar = new Map(
        decisions.map((decision) => [String(decision.jarId), decision.action]),
      );

      if (
        decisions.length !== jars.length ||
        decisionByJar.size !== jars.length ||
        [...decisionByJar.keys()].some((jarId) => !jarIds.has(jarId))
      ) {
        throw new AppError(
          422,
          "VALIDATION_ERROR",
          "Cần cung cấp đúng một quyết định cho mỗi lọ",
        );
      }

      const sweepTarget = jars.find((jar) => jar.isSweepTarget);
      if (!sweepTarget) {
        throw new AppError(
          500,
          "SWEEP_TARGET_NOT_FOUND",
          "Không tìm thấy lọ đích để sweep",
        );
      }

      const nextPeriod = await getOrCreateCurrentPeriod(
        userId,
        new Date(period.endDate.getTime() + 1),
        session,
      );
      const stats = await JarPeriodStat.find({ userId, periodId }).session(
        session,
      );
      const statByJar = new Map(
        stats.map((stat) => [String(stat.jarId), stat]),
      );

      for (const jar of jars) {
        const action = decisionByJar.get(String(jar._id));
        const stat = statByJar.get(String(jar._id));
        const closingBalance =
          stat?.closingBalance ?? calculateClosingBalance(stat ?? {});

        await JarPeriodStat.updateOne(
          { userId, jarId: jar._id, periodId },
          {
            $set: {
              closingBalance,
              closeDecision: action,
              closeDecisionAmount: closingBalance,
            },
          },
          { upsert: true, setDefaultsOnInsert: true, session },
        );

        const shouldSweep =
          action === "sweep" &&
          closingBalance > 0 &&
          String(jar._id) !== String(sweepTarget._id);
        const targetJarId = shouldSweep ? sweepTarget._id : jar._id;

        await JarPeriodStat.updateOne(
          { userId, jarId: targetJarId, periodId: nextPeriod._id },
          {
            $inc: {
              openingBalance: closingBalance,
              spendingLimit: closingBalance,
            },
          },
          { upsert: true, setDefaultsOnInsert: true, session },
        );

        if (shouldSweep) {
          await Promise.all([
            Jar.updateOne(
              { _id: jar._id, userId },
              { $inc: { balance: -closingBalance } },
              { session },
            ),
            Jar.updateOne(
              { _id: sweepTarget._id, userId },
              { $inc: { balance: closingBalance } },
              { session },
            ),
          ]);
        }
      }

      period.status = "closed";
      period.closedAt = new Date();
      await period.save({ session });
      result = { period, nextPeriod };
    });
  } finally {
    await session.endSession();
  }

  await snapshotDuePeriodsForUser(userId, new Date());
  return result;
}
