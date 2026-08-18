// Transaction Engine: parse, bulk, edit/delete/history và late backfill.
import mongoose from "mongoose";
import crypto from "node:crypto";

import { FinancialPeriod } from "../models/FinancialPeriod.js";
import { Jar } from "../models/Jar.js";
import { PersonalDictionaryRule } from "../models/PersonalDictionaryRule.js";
import { Transaction } from "../models/Transaction.js";
import { TransactionHistory } from "../models/TransactionHistory.js";
import { AppError } from "../utils/AppError.js";
import { normalizeText } from "../utils/text.js";
import { getOrCreateCurrentPeriod } from "../services/periodService.js";
import { adjustJarBalance } from "../services/jarBalanceService.js";
import { adjustTotalExpense } from "../services/jarPeriodStatService.js";
import { createIncomeTransaction } from "../services/incomeService.js";
import { parseTransactionLine } from "../services/parsingService.js";
import {
  rebuildExpenseTotalsForPeriod,
  recalculateFromPeriod,
} from "../services/recalculationEngine.js";
import { watchExpenseThreshold } from "../services/thresholdWatcher.js";
import {
  createBorrowTransfer,
  suggestBorrowingSource,
} from "../services/transferService.js";

const MAX_BULK_LINES = 200;

function splitBulkLines(rawText) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function emptyRecalc() {
  return { affectedPeriodIds: [], createdAdjustmentTransactionIds: [] };
}

function serializeComparable(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function buildUpdateDiff(transaction, patch) {
  const diff = [];
  for (const field of ["amount", "jarId", "transactionDate"]) {
    if (patch[field] === undefined) continue;
    const oldValue = transaction[field];
    const newValue = patch[field];
    if (serializeComparable(oldValue) === serializeComparable(newValue)) continue;
    diff.push({ field, oldValue, newValue });
  }
  return diff;
}

async function createHistory(
  {
    userId,
    transactionId,
    changeType,
    diff,
    recalc = emptyRecalc(),
  },
  session,
) {
  const [history] = await TransactionHistory.create(
    [
      {
        userId,
        transactionId,
        changeType,
        diff,
        triggeredRecalc: recalc.affectedPeriodIds.length > 0,
        affectedPeriodIds: recalc.affectedPeriodIds,
        createdAdjustmentTransactionIds:
          recalc.createdAdjustmentTransactionIds,
        changedAt: new Date(),
      },
    ],
    session ? { session } : undefined,
  );
  return history;
}

export async function createExpenseTransaction({
  userId,
  amount,
  rawText,
  description,
  jarId,
  isPredicted,
  predictionConfidence,
  matchedDictionaryRuleId,
  transactionDate,
  source,
  bulkBatchId,
  session,
  period: providedPeriod,
}) {
  const period =
    providedPeriod ??
    (await getOrCreateCurrentPeriod(userId, transactionDate, session));

  const [transaction] = await Transaction.create(
    [
      {
        userId,
        type: "expense",
        amount,
        rawText,
        description,
        transactionDate,
        periodId: period._id,
        jarId,
        isPredicted,
        predictionConfidence,
        matchedDictionaryRuleId,
        source,
        bulkBatchId: bulkBatchId ?? null,
      },
    ],
    session ? { session } : undefined,
  );

  if (jarId) {
    if (period.status === "open") {
      await adjustJarBalance(jarId, -amount, session);
      await watchExpenseThreshold({
        userId,
        jarId,
        periodId: period._id,
        amount,
        session,
      });
    } else {
      // Backfill vào kỳ đã snapshot/closed chỉ sửa ledger lịch sử. Không được
      // trừ Jar.balance hiện tại trực tiếp; Recalculation Engine sẽ bù bằng
      // Adjustment Entry tại kỳ hiện tại.
      await adjustTotalExpense(userId, jarId, period._id, amount, session);
    }
  }

  return { transaction, period };
}

async function persistParsedExpense({
  userId,
  parsed,
  rawText,
  transactionDate,
  source = "realtime",
  bulkBatchId = null,
}) {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const period = await getOrCreateCurrentPeriod(
        userId,
        transactionDate,
        session,
      );
      const created = await createExpenseTransaction({
        userId,
        amount: parsed.amount,
        rawText,
        description: parsed.description,
        jarId: parsed.jarId,
        isPredicted: parsed.isPredicted,
        predictionConfidence: parsed.predictionConfidence ?? null,
        matchedDictionaryRuleId: parsed.matchedDictionaryRuleId ?? null,
        transactionDate,
        source,
        bulkBatchId,
        session,
        period,
      });

      let recalc = emptyRecalc();
      if (period.status !== "open") {
        recalc = await recalculateFromPeriod(
          {
            userId,
            periodId: period._id,
            sourceTransactionId: created.transaction._id,
          },
          session,
        );
        await createHistory(
          {
            userId,
            transactionId: created.transaction._id,
            changeType: "create",
            diff: [
              {
                field: "lateBackfill",
                oldValue: null,
                newValue: transactionDate,
              },
            ],
            recalc,
          },
          session,
        );
      }

      result = { ...created, recalc };
    });
  } finally {
    await session.endSession();
  }

  return result;
}

export async function parseTransaction(req, res) {
  const { rawText, transactionDate } = req.body;
  const effectiveDate = transactionDate ?? new Date();
  const parsed = await parseTransactionLine(req.userId, rawText);

  if (parsed.isParseError) {
    throw new AppError(
      422,
      "UNPARSEABLE_LINE",
      "Không nhận diện được số tiền trong nội dung đã nhập",
    );
  }

  if (parsed.isIncome) {
    return res.status(200).json({
      pendingIncome: {
        amount: parsed.amount,
        description: parsed.description,
        rawText,
        transactionDate: effectiveDate,
      },
    });
  }

  const period = await getOrCreateCurrentPeriod(req.userId, effectiveDate);

  // Borrowing suggestion chỉ có ý nghĩa với số dư live của kỳ open. Backfill
  // vào kỳ cũ đi thẳng qua Recalculation Engine.
  if (period.status === "open") {
    const jar = parsed.jarId
      ? await Jar.findOne({ _id: parsed.jarId, userId: req.userId }).lean()
      : null;
    if (jar && jar.balance < parsed.amount) {
      const shortfallAmount = parsed.amount - jar.balance;
      const borrowingSuggestion = await suggestBorrowingSource(
        req.userId,
        jar._id,
        shortfallAmount,
      );
      return res.status(200).json({
        pendingExpense: {
          amount: parsed.amount,
          description: parsed.description,
          rawText,
          jarId: parsed.jarId,
          isPredicted: parsed.isPredicted,
          predictionConfidence: parsed.predictionConfidence,
          matchedDictionaryRuleId: parsed.matchedDictionaryRuleId,
          transactionDate: effectiveDate,
        },
        insufficientBalance: {
          jarId: jar._id,
          availableBalance: jar.balance,
          shortfallAmount,
        },
        borrowingSuggestion,
      });
    }
  }

  const { transaction, recalc } = await persistParsedExpense({
    userId: req.userId,
    parsed,
    rawText,
    transactionDate: effectiveDate,
  });

  res.status(201).json({
    transaction,
    isPredicted: parsed.isPredicted,
    recalc: {
      affectedPeriodIds: recalc.affectedPeriodIds,
      adjustmentsCreated: recalc.createdAdjustmentTransactionIds,
    },
  });
}

export async function expenseFollowup(req, res) {
  const { pendingExpense, decision, borrowFromJarId, confirmSensitiveWarning } =
    req.body;
  const effectiveDate = pendingExpense.transactionDate ?? new Date();

  const session = await mongoose.startSession();
  let transaction;
  let transfer = null;
  let debt = null;

  try {
    await session.withTransaction(async () => {
      const period = await getOrCreateCurrentPeriod(
        req.userId,
        effectiveDate,
        session,
      );
      if (period.status !== "open") {
        throw new AppError(
          409,
          "HISTORICAL_EXPENSE_FOLLOWUP_NOT_REQUIRED",
          "Giao dịch backdate không dùng luồng mượn tiền theo số dư hiện tại",
        );
      }

      if (decision === "borrow") {
        const targetJar = await Jar.findOne({
          _id: pendingExpense.jarId,
          userId: req.userId,
        }).session(session);
        if (!targetJar) {
          throw new AppError(404, "JAR_NOT_FOUND", "Không tìm thấy lọ đích");
        }

        const shortfallAmount = Math.max(
          0,
          pendingExpense.amount - targetJar.balance,
        );
        if (shortfallAmount > 0) {
          const borrowResult = await createBorrowTransfer(
            {
              userId: req.userId,
              fromJarId: borrowFromJarId,
              toJarId: pendingExpense.jarId,
              amount: shortfallAmount,
              note: `Bù thiếu hụt cho khoản chi: ${pendingExpense.description ?? ""}`,
              transactionDate: effectiveDate,
              trigger: "contextual_suggestion",
              confirmSensitiveWarning,
            },
            session,
          );
          transfer = borrowResult.transaction;
          debt = borrowResult.debt;
        }
      }

      const created = await createExpenseTransaction({
        userId: req.userId,
        amount: pendingExpense.amount,
        rawText: pendingExpense.rawText ?? null,
        description: pendingExpense.description ?? "",
        jarId: pendingExpense.jarId,
        isPredicted: pendingExpense.isPredicted ?? false,
        predictionConfidence: pendingExpense.predictionConfidence ?? null,
        matchedDictionaryRuleId: pendingExpense.matchedDictionaryRuleId ?? null,
        transactionDate: effectiveDate,
        source: "realtime",
        session,
        period,
      });
      transaction = created.transaction;

      if (transfer) {
        transfer.transferMeta.relatedExpenseTransactionId = transaction._id;
        await transfer.save({ session });
      }
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({ transaction, transfer, debt });
}

export async function parseBulkTransactions(req, res) {
  const { rawText } = req.body;
  const lines = splitBulkLines(rawText);
  if (lines.length === 0 || lines.length > MAX_BULK_LINES) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      lines.length === 0
        ? "Không tìm thấy dòng nội dung nào để phân tích"
        : `Chỉ hỗ trợ tối đa ${MAX_BULK_LINES} dòng mỗi lần dán`,
    );
  }

  const items = [];
  for (const line of lines) {
    const parsed = await parseTransactionLine(req.userId, line);
    items.push({
      clientLineId: crypto.randomUUID(),
      rawText: line,
      amount: parsed.amount,
      description: parsed.description,
      jarId: parsed.jarId,
      isPredicted: parsed.isPredicted,
      isParseError: parsed.isParseError,
      isIncome: parsed.isIncome,
    });
  }
  res.status(200).json({ items });
}

export async function bulkConfirmTransactions(req, res) {
  const { items, transactionDate } = req.body;
  const effectiveDate = transactionDate ?? new Date();
  if (items.some((item) => item.isParseError)) {
    throw new AppError(
      422,
      "UNPARSEABLE_LINE",
      "Còn dòng chưa xử lý xong - vui lòng sửa hoặc loại bỏ trước khi xác nhận",
    );
  }

  const bulkBatchId = crypto.randomUUID();
  const session = await mongoose.startSession();
  const createdTransactions = [];

  try {
    await session.withTransaction(async () => {
      const period = await getOrCreateCurrentPeriod(
        req.userId,
        effectiveDate,
        session,
      );

      if (period.status !== "open" && items.some((item) => item.isIncome)) {
        throw new AppError(
          422,
          "HISTORICAL_BULK_INCOME_UNSUPPORTED",
          "Bulk income backdate vào kỳ đã chốt cần được xác nhận riêng qua Income flow",
        );
      }

      for (const item of items) {
        if (item.isIncome) {
          const income = await createIncomeTransaction(
            {
              userId: req.userId,
              amount: item.amount,
              description: item.description,
              rawText: item.rawText ?? null,
              transactionDate: effectiveDate,
              incomeType: "standard_split",
              source: "bulk_input",
              bulkBatchId,
            },
            session,
          );
          createdTransactions.push(income.transaction);
          continue;
        }

        const expense = await createExpenseTransaction({
          userId: req.userId,
          amount: item.amount,
          rawText: item.rawText ?? null,
          description: item.description,
          jarId: item.jarId,
          isPredicted: item.isPredicted,
          predictionConfidence: null,
          matchedDictionaryRuleId: null,
          transactionDate: effectiveDate,
          source: "bulk_input",
          bulkBatchId,
          session,
          period,
        });
        createdTransactions.push(expense.transaction);

        if (period.status !== "open") {
          const recalc = await recalculateFromPeriod(
            {
              userId: req.userId,
              periodId: period._id,
              sourceTransactionId: expense.transaction._id,
            },
            session,
          );
          await createHistory(
            {
              userId: req.userId,
              transactionId: expense.transaction._id,
              changeType: "create",
              diff: [
                {
                  field: "lateBackfill",
                  oldValue: null,
                  newValue: effectiveDate,
                },
              ],
              recalc,
            },
            session,
          );
        }
      }
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({
    transactions: createdTransactions,
    bulkBatchId,
    skippedIncomeItems: [],
  });
}

async function performExpenseUpdate(userId, id, patch) {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const transaction = await Transaction.findOne({
        _id: id,
        userId,
        isDeleted: false,
      }).session(session);
      if (!transaction) {
        throw new AppError(
          404,
          "TRANSACTION_NOT_FOUND",
          "Không tìm thấy giao dịch",
        );
      }
      if (transaction.type !== "expense") {
        throw new AppError(
          422,
          "TRANSACTION_TYPE_NOT_EDITABLE",
          "Giai đoạn chỉnh sửa này áp dụng cho giao dịch Chi tiêu",
        );
      }

      const diff = buildUpdateDiff(transaction, patch);
      if (diff.length === 0) {
        result = { transaction, recalc: emptyRecalc() };
        return;
      }

      const oldAmount = transaction.amount;
      const oldJarId = transaction.jarId;
      const oldPeriod = await FinancialPeriod.findOne({
        _id: transaction.periodId,
        userId,
      }).session(session);

      const newAmount = patch.amount ?? transaction.amount;
      const newJarId = patch.jarId ?? transaction.jarId;
      const newDate = patch.transactionDate ?? transaction.transactionDate;

      if (newJarId) {
        const newJar = await Jar.findOne({ _id: newJarId, userId }).session(
          session,
        );
        if (!newJar) {
          throw new AppError(404, "JAR_NOT_FOUND", "Không tìm thấy lọ");
        }
      }

      const newPeriod = await getOrCreateCurrentPeriod(userId, newDate, session);

      // Chỉ thay đổi cache trực tiếp đối với phần giao dịch nằm trong kỳ open.
      // Kỳ closed/pending được phản ánh qua Recalculation Engine.
      if (oldPeriod?.status === "open" && oldJarId) {
        await adjustJarBalance(oldJarId, oldAmount, session);
      }
      if (newPeriod.status === "open" && newJarId) {
        await adjustJarBalance(newJarId, -newAmount, session);
      }

      transaction.amount = newAmount;
      transaction.jarId = newJarId;
      transaction.transactionDate = newDate;
      transaction.periodId = newPeriod._id;
      transaction.isPredicted = false;
      transaction.editCount += 1;
      transaction.lastEditedAt = new Date();
      await transaction.save({ session });

      await rebuildExpenseTotalsForPeriod(userId, oldPeriod._id, session);
      if (String(oldPeriod._id) !== String(newPeriod._id)) {
        await rebuildExpenseTotalsForPeriod(userId, newPeriod._id, session);
      }

      const nonOpenPeriods = [oldPeriod, newPeriod]
        .filter((period) => period && period.status !== "open")
        .sort((a, b) => a.startDate - b.startDate);

      let recalc = emptyRecalc();
      if (nonOpenPeriods.length > 0) {
        recalc = await recalculateFromPeriod(
          {
            userId,
            periodId: nonOpenPeriods[0]._id,
            sourceTransactionId: transaction._id,
          },
          session,
        );
      }

      await createHistory(
        {
          userId,
          transactionId: transaction._id,
          changeType: "update",
          diff,
          recalc,
        },
        session,
      );

      result = { transaction, recalc };
    });
  } finally {
    await session.endSession();
  }

  return result;
}

export async function updateTransaction(req, res) {
  const result = await performExpenseUpdate(req.userId, req.params.id, req.body);
  res.status(200).json({
    transaction: result.transaction,
    recalc: {
      affectedPeriodIds: result.recalc.affectedPeriodIds,
      adjustmentsCreated: result.recalc.createdAdjustmentTransactionIds,
    },
  });
}

export async function updateTransactionJar(req, res) {
  const { jarId } = req.body;
  const result = await performExpenseUpdate(req.userId, req.params.id, { jarId });
  const transaction = result.transaction;

  const keyword = normalizeText(
    transaction.description || transaction.rawText || "",
  );
  if (keyword) {
    await PersonalDictionaryRule.updateOne(
      { userId: req.userId, keyword },
      {
        $set: { jarId, sourceType: "user_correction" },
        $inc: { matchCount: 1 },
      },
      { upsert: true },
    );
  }

  res.status(200).json({
    transaction,
    recalc: {
      affectedPeriodIds: result.recalc.affectedPeriodIds,
      adjustmentsCreated: result.recalc.createdAdjustmentTransactionIds,
    },
  });
}

export async function deleteTransaction(req, res) {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const transaction = await Transaction.findOne({
        _id: req.params.id,
        userId: req.userId,
        isDeleted: false,
      }).session(session);
      if (!transaction) {
        throw new AppError(
          404,
          "TRANSACTION_NOT_FOUND",
          "Không tìm thấy giao dịch",
        );
      }
      if (transaction.type !== "expense") {
        throw new AppError(
          422,
          "TRANSACTION_TYPE_NOT_EDITABLE",
          "Giai đoạn chỉnh sửa này áp dụng cho giao dịch Chi tiêu",
        );
      }

      const period = await FinancialPeriod.findOne({
        _id: transaction.periodId,
        userId: req.userId,
      }).session(session);

      if (period?.status === "open" && transaction.jarId) {
        await adjustJarBalance(transaction.jarId, transaction.amount, session);
      }

      transaction.isDeleted = true;
      transaction.deletedAt = new Date();
      transaction.editCount += 1;
      transaction.lastEditedAt = new Date();
      await transaction.save({ session });

      await rebuildExpenseTotalsForPeriod(req.userId, period._id, session);

      let recalc = emptyRecalc();
      if (period.status !== "open") {
        recalc = await recalculateFromPeriod(
          {
            userId: req.userId,
            periodId: period._id,
            sourceTransactionId: transaction._id,
          },
          session,
        );
      }

      await createHistory(
        {
          userId: req.userId,
          transactionId: transaction._id,
          changeType: "delete",
          diff: [{ field: "isDeleted", oldValue: false, newValue: true }],
          recalc,
        },
        session,
      );

      result = { transaction, recalc };
    });
  } finally {
    await session.endSession();
  }

  res.status(200).json({
    transaction: result.transaction,
    recalc: {
      affectedPeriodIds: result.recalc.affectedPeriodIds,
      adjustmentsCreated: result.recalc.createdAdjustmentTransactionIds,
    },
  });
}

export async function getTransactionHistory(req, res) {
  const transaction = await Transaction.findOne({
    _id: req.params.id,
    userId: req.userId,
  }).select("_id");
  if (!transaction) {
    throw new AppError(
      404,
      "TRANSACTION_NOT_FOUND",
      "Không tìm thấy giao dịch",
    );
  }

  const history = await TransactionHistory.find({
    userId: req.userId,
    transactionId: transaction._id,
  }).sort({ changedAt: -1, _id: -1 });

  res.status(200).json({ history });
}

export async function listTransactions(req, res) {
  const {
    periodId,
    jarId,
    type,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
  } = req.query;
  const filter = { userId: req.userId, isDeleted: false };
  if (periodId) filter.periodId = periodId;
  if (jarId) filter.jarId = jarId;
  if (type) filter.type = type;
  if (dateFrom || dateTo) {
    filter.transactionDate = {};
    if (dateFrom) filter.transactionDate.$gte = dateFrom;
    if (dateTo) filter.transactionDate.$lte = dateTo;
  }

  const [transactions, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Transaction.countDocuments(filter),
  ]);
  res.status(200).json({ transactions, pagination: { page, limit, total } });
}

export async function getTransaction(req, res) {
  const transaction = await Transaction.findOne({
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
  res.status(200).json({ transaction });
}
