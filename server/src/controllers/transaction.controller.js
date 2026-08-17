// /transactions/parse, /parse-bulk, /bulk-confirm, /:id/jar,
// GET /transactions, GET /transactions/:id — muc 9
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

const MAX_BULK_LINES = 200;

function splitBulkLines(rawText) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function createExpenseTransaction({
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

  // Chi tiêu làm giảm cache Jar.balance và đồng thời tăng totalExpense của
  // đúng lọ/kỳ. thresholdWatcher chịu trách nhiệm chống gửi lặp 80/90%.
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

  // TODO Giai đoạn 7: kiểm tra số dư trước khi tạo expense và hoàn thiện
  // expense-followup / contextual borrowing (US6.2).
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

export async function parseBulkTransactions(req, res) {
  const { rawText } = req.body;
  const lines = splitBulkLines(rawText);

  if (lines.length === 0) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Không tìm thấy dòng nội dung nào để phân tích",
    );
  }

  if (lines.length > MAX_BULK_LINES) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      `Chỉ hỗ trợ tối đa ${MAX_BULK_LINES} dòng mỗi lần dán`,
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

  const hasParsedError = items.some((item) => item.isParseError);
  if (hasParsedError) {
    throw new AppError(
      422,
      "UNPARSEABLE_LINE",
      "Còn dòng chưa xử lý xong (không nhận diện được) - vui lòng sửa hoặc loại bỏ trước khi xác nhận",
    );
  }

  // Bulk income vẫn giữ hành vi hiện tại: tách ra để client xử lý riêng.
  // Việc đồng bộ bulk income với Standard Split sẽ được xử lý độc lập để
  // không trộn thay đổi ngoài phạm vi Giai đoạn 5 vào transaction Mongo này.
  const expenseItems = items.filter((item) => !item.isIncome);
  const skippedIncomeItems = items.filter((item) => item.isIncome);

  const bulkBatchId = crypto.randomUUID();
  const session = await mongoose.startSession();
  let createdTransactions = [];
  try {
    await session.withTransaction(async () => {
      createdTransactions = [];
      for (const item of expenseItems) {
        const transaction = await createExpenseTransaction({
          userId: req.userId,
          amount: item.amount,
          rawText: item.rawText,
          description: item.description,
          jarId: item.jarId,
          isPredicted: item.isPredicted,
          predictionConfidence: null,
          matchedDictionaryRuleId: null,
          transactionDate: effectiveDate,
          source: "bulk_input",
          bulkBatchId,
          session,
        });
        createdTransactions.push(transaction);
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
  if (!newJar) {
    throw new AppError(404, "JAR_NOT_FOUND", "Không tìm thấy lọ");
  }

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

  res.status(200).json({
    transactions,
    pagination: { page, limit, total },
  });
}

export async function getTransaction(req, res) {
  const { id } = req.params;

  const transaction = await Transaction.findOne({
    _id: id,
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
