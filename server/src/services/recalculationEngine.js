// Recalculation Engine - US5.2 / US5.4.
import { FinancialPeriod } from "../models/FinancialPeriod.js";
import { Jar } from "../models/Jar.js";
import { JarPeriodStat } from "../models/JarPeriodStat.js";
import { Notification } from "../models/Notification.js";
import { Transaction } from "../models/Transaction.js";
import { AppError } from "../utils/AppError.js";
import { adjustJarBalance } from "./jarBalanceService.js";
import {
  calculateClosingBalance,
  getOrCreateCurrentPeriod,
} from "./periodService.js";

function asKey(value) {
  return String(value);
}

export async function rebuildExpenseTotalsForPeriod(
  userId,
  periodId,
  session,
) {
  let query = Transaction.aggregate([
    {
      $match: {
        userId,
        periodId,
        type: "expense",
        isDeleted: false,
        jarId: { $ne: null },
      },
    },
    { $group: { _id: "$jarId", totalExpense: { $sum: "$amount" } } },
  ]);
  if (session) query = query.session(session);
  const totals = await query;
  const totalByJar = new Map(
    totals.map((item) => [asKey(item._id), item.totalExpense]),
  );

  let jarsQuery = Jar.find({ userId });
  if (session) jarsQuery = jarsQuery.session(session);
  const jars = await jarsQuery;

  for (const jar of jars) {
    await JarPeriodStat.updateOne(
      { userId, jarId: jar._id, periodId },
      { $set: { totalExpense: totalByJar.get(asKey(jar._id)) ?? 0 } },
      { upsert: true, setDefaultsOnInsert: true, session },
    );
  }
}

function buildCarryMap(jars, statByJar, sweepTarget) {
  const carry = new Map(jars.map((jar) => [asKey(jar._id), 0]));

  for (const jar of jars) {
    const stat = statByJar.get(asKey(jar._id));
    const closingBalance = calculateClosingBalance(stat ?? {});
    const shouldSweep =
      stat?.closeDecision === "sweep" &&
      closingBalance > 0 &&
      asKey(jar._id) !== asKey(sweepTarget?._id);
    const targetJarId = shouldSweep ? sweepTarget._id : jar._id;
    carry.set(
      asKey(targetJarId),
      (carry.get(asKey(targetJarId)) ?? 0) + closingBalance,
    );
  }

  return carry;
}

async function syncSourceAdjustments({
  userId,
  sourceTransactionId,
  affectedPeriodId,
  currentPeriod,
  jars,
  expectedOpening,
  session,
}) {
  const currentStats = await JarPeriodStat.find({
    userId,
    periodId: currentPeriod._id,
  }).session(session ?? null);
  const statByJar = new Map(
    currentStats.map((stat) => [asKey(stat.jarId), stat]),
  );

  const existingAdjustments = await Transaction.find({
    userId,
    type: "adjustment",
    periodId: currentPeriod._id,
    isDeleted: false,
  }).session(session ?? null);

  const sourceAdjustments = new Map();
  const otherAdjustmentTotalByJar = new Map();

  for (const adjustment of existingAdjustments) {
    const jarKey = asKey(adjustment.jarId);
    if (
      asKey(adjustment.adjustmentMeta?.sourceTransactionId) ===
      asKey(sourceTransactionId)
    ) {
      sourceAdjustments.set(jarKey, adjustment);
    } else {
      otherAdjustmentTotalByJar.set(
        jarKey,
        (otherAdjustmentTotalByJar.get(jarKey) ?? 0) +
          (adjustment.adjustmentMeta?.deltaAmount ?? 0),
      );
    }
  }

  const createdAdjustmentTransactionIds = [];
  const changes = [];

  for (const jar of jars) {
    const jarKey = asKey(jar._id);
    const stat = statByJar.get(jarKey);
    const actualOpening = stat?.openingBalance ?? 0;
    const desiredTotalAdjustment =
      (expectedOpening.get(jarKey) ?? actualOpening) - actualOpening;
    const desiredSourceAdjustment =
      desiredTotalAdjustment - (otherAdjustmentTotalByJar.get(jarKey) ?? 0);

    const existing = sourceAdjustments.get(jarKey);
    const previousDelta = existing?.adjustmentMeta?.deltaAmount ?? 0;
    const deltaDifference = desiredSourceAdjustment - previousDelta;

    if (deltaDifference !== 0) {
      await adjustJarBalance(jar._id, deltaDifference, session);
      await JarPeriodStat.updateOne(
        { userId, jarId: jar._id, periodId: currentPeriod._id },
        { $inc: { totalAdjustment: deltaDifference } },
        { upsert: true, setDefaultsOnInsert: true, session },
      );
    }

    if (desiredSourceAdjustment === 0) {
      if (existing) {
        existing.isDeleted = true;
        existing.deletedAt = new Date();
        await existing.save({ session });
      }
      continue;
    }

    if (existing) {
      existing.amount = Math.abs(desiredSourceAdjustment);
      existing.transactionDate = new Date();
      existing.adjustmentMeta.deltaAmount = desiredSourceAdjustment;
      existing.adjustmentMeta.affectedPeriodId = affectedPeriodId;
      existing.lastEditedAt = new Date();
      existing.editCount += 1;
      await existing.save({ session });
      createdAdjustmentTransactionIds.push(existing._id);
    } else {
      const [created] = await Transaction.create(
        [
          {
            userId,
            type: "adjustment",
            amount: Math.abs(desiredSourceAdjustment),
            rawText: null,
            description: "Điều chỉnh do cập nhật dữ liệu quá khứ",
            transactionDate: new Date(),
            periodId: currentPeriod._id,
            jarId: jar._id,
            source: "system",
            adjustmentMeta: {
              reason: "late_backfill_delta",
              affectedPeriodId,
              sourceTransactionId,
              deltaAmount: desiredSourceAdjustment,
            },
          },
        ],
        { session },
      );
      createdAdjustmentTransactionIds.push(created._id);
    }

    if (deltaDifference !== 0) {
      changes.push({ jarId: jar._id, deltaAmount: desiredSourceAdjustment });
    }
  }

  if (changes.length > 0) {
    await Notification.create(
      [
        {
          userId,
          type: "adjustment_created",
          payload: {
            sourceTransactionId,
            affectedPeriodId,
            adjustments: changes,
          },
          deepLink: `/transactions/${sourceTransactionId}`,
          sentAt: new Date(),
        },
      ],
      { session },
    );
  }

  return createdAdjustmentTransactionIds;
}

/**
 * Rebuild tuần tự từ kỳ bị thay đổi tới kỳ hiện tại.
 * - Kỳ đã closed: sửa số liệu lịch sử + opening/closing của chuỗi kỳ.
 * - Kỳ pending_close: cập nhật snapshot đúng rồi dừng, chưa tạo adjustment.
 * - Kỳ open hiện tại: giữ openingBalance thực tế đã từng rollover/sweep và
 *   dùng Transaction[adjustment] để bù chênh lệch, tránh double count.
 */
export async function recalculateFromPeriod(
  { userId, periodId, sourceTransactionId },
  session,
) {
  let startQuery = FinancialPeriod.findOne({ _id: periodId, userId });
  if (session) startQuery = startQuery.session(session);
  const startPeriod = await startQuery;
  if (!startPeriod) {
    throw new AppError(404, "PERIOD_NOT_FOUND", "Không tìm thấy kỳ tài chính");
  }

  await getOrCreateCurrentPeriod(userId, new Date(), session);

  let jarsQuery = Jar.find({ userId }).sort({ order: 1 });
  if (session) jarsQuery = jarsQuery.session(session);
  const jars = await jarsQuery;
  const sweepTarget = jars.find((jar) => jar.isSweepTarget);

  let periodsQuery = FinancialPeriod.find({
    userId,
    startDate: { $gte: startPeriod.startDate },
  }).sort({ startDate: 1 });
  if (session) periodsQuery = periodsQuery.session(session);
  const periods = await periodsQuery;

  const affectedPeriodIds = [];
  let carryOpening = null;
  let currentPeriod = null;

  for (const period of periods) {
    await rebuildExpenseTotalsForPeriod(userId, period._id, session);

    if (period.status === "open") {
      currentPeriod = period;
      break;
    }

    const stats = await JarPeriodStat.find({
      userId,
      periodId: period._id,
    }).session(session ?? null);
    const statByJar = new Map(stats.map((stat) => [asKey(stat.jarId), stat]));

    if (carryOpening) {
      for (const jar of jars) {
        await JarPeriodStat.updateOne(
          { userId, jarId: jar._id, periodId: period._id },
          { $set: { openingBalance: carryOpening.get(asKey(jar._id)) ?? 0 } },
          { upsert: true, setDefaultsOnInsert: true, session },
        );
      }
    }

    const refreshedStats = await JarPeriodStat.find({
      userId,
      periodId: period._id,
    }).session(session ?? null);
    const refreshedByJar = new Map(
      refreshedStats.map((stat) => [asKey(stat.jarId), stat]),
    );

    for (const jar of jars) {
      const stat = refreshedByJar.get(asKey(jar._id));
      await JarPeriodStat.updateOne(
        { userId, jarId: jar._id, periodId: period._id },
        { $set: { closingBalance: calculateClosingBalance(stat ?? {}) } },
        { upsert: true, setDefaultsOnInsert: true, session },
      );
    }

    affectedPeriodIds.push(period._id);

    if (period.status === "pending_close") {
      return {
        affectedPeriodIds,
        createdAdjustmentTransactionIds: [],
      };
    }

    const closedStats = await JarPeriodStat.find({
      userId,
      periodId: period._id,
    }).session(session ?? null);
    carryOpening = buildCarryMap(
      jars,
      new Map(closedStats.map((stat) => [asKey(stat.jarId), stat])),
      sweepTarget,
    );
  }

  if (!currentPeriod || !carryOpening) {
    return {
      affectedPeriodIds,
      createdAdjustmentTransactionIds: [],
    };
  }

  const createdAdjustmentTransactionIds = await syncSourceAdjustments({
    userId,
    sourceTransactionId,
    affectedPeriodId: startPeriod._id,
    currentPeriod,
    jars,
    expectedOpening: carryOpening,
    session,
  });

  return { affectedPeriodIds, createdAdjustmentTransactionIds };
}
