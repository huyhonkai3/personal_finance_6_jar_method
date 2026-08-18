// Transaction Engine: parse, bulk, expense follow-up, list/detail.
import mongoose from "mongoose";
import crypto from "node:crypto";

import { Jar } from "../models/Jar.js";
import { Transaction } from "../models/Transaction.js";
import { PersonalDictionaryRule } from "../models/PersonalDictionaryRule.js";
import { AppError } from "../utils/AppError.js";
import { normalizeText } from "../utils/text.js";
import { getOrCreateCurrentPeriod } from "../services/periodService.js";
import { adjustJarBalance } from "../services/jarBalanceService.js";
import { adjustTotalExpense } from "../services/jarPeriodStatService.js";
import { parseTransactionLine } from "../services/parsingService.js";
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
}) {
  const period = await getOrCreateCurrentPeriod(userId, transactionDate);
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
    await adjustJarBalance(jarId, -amount, session);
    await watchExpenseThreshold({
      userId,
      jarId,
      periodId: period._id,
      amount,
      session,
    });
  }
  return transaction;
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

  const transaction = await createExpenseTransaction({
    userId: req.userId,
    amount: parsed.amount,
    rawText,
    description: parsed.description,
    jarId: parsed.jarId,
    isPredicted: parsed.isPredicted,
    predictionConfidence: parsed.predictionConfidence,
    matchedDictionaryRuleId: parsed.matchedDictionaryRuleId,
    transactionDate: effectiveDate,
    source: "realtime",
  });

  res.status(201).json({ transaction, isPredicted: parsed.isPredicted });
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

      transaction = await createExpenseTransaction({
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
      });

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

  const expenseItems = items.filter((item) => !item.isIncome);
  const skippedIncomeItems = items.filter((item) => item.isIncome);
  const bulkBatchId = crypto.randomUUID();
  const session = await mongoose.startSession();
  let createdTransactions = [];
  try {
    await session.withTransaction(async () => {
      for (const item of expenseItems) {
        createdTransactions.push(
          await createExpenseTransaction({
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
          }),
        );
      }
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({
    transactions: createdTransactions,
    bulkBatchId,
    skippedIncomeItems,
  });
}

export async function updateTransactionJar(req, res) {
  const { id } = req.params;
  const { jarId } = req.body;
  const transaction = await Transaction.findOne({
    _id: id,
    userId: req.userId,
  });
  if (!transaction || transaction.isDeleted) {
    throw new AppError(
      404,
      "TRANSACTION_NOT_FOUND",
      "Không tìm thấy giao dịch",
    );
  }
  if (transaction.type !== "expense") {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Chỉ có thể đổi lọ cho giao dịch Chi tiêu",
    );
  }

  const newJar = await Jar.findOne({ _id: jarId, userId: req.userId });
  if (!newJar) throw new AppError(404, "JAR_NOT_FOUND", "Không tìm thấy lọ");

  const oldJarId = transaction.jarId;
  const isSameJar = oldJarId && String(oldJarId) === String(jarId);
  if (!isSameJar) {
    if (oldJarId) {
      await adjustJarBalance(oldJarId, transaction.amount);
      await adjustTotalExpense(
        req.userId,
        oldJarId,
        transaction.periodId,
        -transaction.amount,
      );
    }
    await adjustJarBalance(jarId, -transaction.amount);
    await watchExpenseThreshold({
      userId: req.userId,
      jarId,
      periodId: transaction.periodId,
      amount: transaction.amount,
    });
    transaction.jarId = jarId;
    transaction.isPredicted = false;
    transaction.editCount += 1;
    transaction.lastEditedAt = new Date();
    await transaction.save();
  }

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
  res.status(200).json({ transaction });
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
