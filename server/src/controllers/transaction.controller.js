// /transactions/parse, /parse-bulk, /bulk-confirm, /:id/jar,
// GET /transactions, GET /transactions/:id — muc 9
// Giai đoạn 3: Chỉ xử lý nhánh Chi tiêu (type=expense). Nhánh thu nhập chỉ dừng ở mức nhận diện (trả pendingIncome preview, không lưu DB)
// việc xử lý phân bổ thực sự thuộc allocationService (Giai đoạn 4, POST /income/confirm).
// expense-followup (mượn tiền khi thiếu số dư) để dành Giai đoạn 7.
import mongoose from "mongoose";
import crypto from "node:crypto";

import { Jar } from "../models/Jar.js";
import { Transaction } from "../models/Transaction.js";
import { PersonalDictionaryRule } from "../models/PersonalDictionaryRule.js";
import { AppError } from "../utils/AppError.js";
import { normalizeText } from "../utils/text.js";
import { getOrCreateCurrentPeriod } from "../services/periodService.js";
import { adjustJarBalance } from "../services/jarBalanceService.js";
import { parseTransactionLine } from "../services/parsingService.js";

const MAX_BULK_LINES = 200;

// HELPER NỘI BỘ
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

  // Chi tiêu -> trừ vào Jar.balance. Giai đoạn 3 tạm thời cho phép số dư âm (chưa kiểm tra đủ/thiếu số dư trước khi lưu).
  // TODO Giai đoạn 7: trước khi tạo Transaction[expense], kiểm tra
  // Jar.balance có đủ không - nếu không đủ, KHÔNG lưu ngay mà trả
  // `pendingExpense` + `insufficientBalance: { shortfall, suggestedSourceJarId }`
  // cho client gọi tiếp POST /transactions/expense-followup (US6.2 AC1).
  if (jarId) {
    await adjustJarBalance(jarId, -amount, session);
  }

  return transaction;
}

// POST /transactions/parse
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

  // Nhánh Thu nhập: KHÔNG lưu, trả pendingIncome preview - client gọi tiếp
  // POST /income/confirm (Giai đoạn 4).
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

  // Nhánh Chi tiêu: tạo và lưu ngay (Giai đoạn 3 - xem TODO Giai đoạn 7 ở
  // createExpenseTransaction).
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

// POST /transactions/parse-bulk (US 1.2, US 1.5) - không lưu DB, chỉ trả staging items
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

// POST /transactions/bulk-confirm (US 1.5 AC4, AC5)
export async function bulkConfirmTransactions(req, res) {
  const { items, transactionDate } = req.body;
  const effectiveDate = transactionDate ?? new Date();

  // US 1.5 AC4: còn dòng lỗi -> chặn toàn bộ, không lưu gì cả.
  const hasParsedError = items.some((item) => item.isParseError);
  if (hasParsedError) {
    throw new AppError(
      422,
      "UNPARSEABLE_LINE",
      "Còn dòng chưa xử lý xong (không nhận diện được) - vui lòng sửa hoặc loại bỏ trước khi xác nhận",
    );
  }

  // Giai đoạn 3 chỉ lưu được Chi tiêu - dòng Thu nhập bị tách riêng, KHÔNG
  // lưu, trả về để client biết còn phần chưa xử lý.
  // TODO Giai đoạn 4: xử lý các item.isIncome === true bằng allocationService
  // (Standard Split hiện hành, đúng như Data Model muc 9.2 mô tả "Dòng
  // isIncome: true được xử lý theo Standard Split hiện hành") thay vì bỏ qua.
  const expenseItems = items.filter((item) => !item.isIncome);
  const skippedIncomeItems = items.filter((item) => item.isIncome);

  const bulkBatchId = crypto.randomUUID();

  // 1 Mongo session cho toàn bộ dòng hợp lệ - US1.5 AC5. LƯU Ý: transaction
  // Mongo yêu cầu deployment dạng replica set (MongoDB Atlas mặc định chạy
  // vậy, kể cả gói M0 free - xem Technical Stack muc 4.3); MongoDB standalone
  // thuần lúc dev local cần bật single-node replica set thì đoạn này mới chạy được.
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

// PATCH /transactions/:id/jar (US 1.3, US 1.4 AC1)
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
    // Đổi lọ nhanh (thẻ chạm-để-sửa) hiện chỉ áp dụng cho Chi tiêu - Thu
    // nhập Targeted dùng targetJarId riêng ở /income/confirm (Giai đoạn 4)
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
    // Hoàn lại số dư cho lọ cũ, trừ vào lọ mới - giữ đúng nguyên tắc
    // Jar.balance luôn tái tạo được 100% từ tổng Transaction chưa xoá.'
    if (oldJarId) {
      await adjustJarBalance(oldJarId, transaction.amount);
    }
    await adjustJarBalance(jarId, -transaction.amount);

    transaction.jarId = jarId;
    transaction.isPredicted = false; //user đã chủ động xác nhận/sửa
    transaction.editCount += 1;
    transaction.lastEditedAt = new Date();
    await transaction.save();
  }

  // Tự động ghi/nâng cấp PersonalDictionaryRule - US 1.4 AC1. Học theo phần
  // mô tả đã chuẩn hoá của giao dịch (không phải rawText thô, vì rawText có
  // thể còn lẫn số tiền/ký tự thừa).
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

// GET /transactions, GET /transactions/:id
export async function listTransactions(req, res) {
  const {
    periodId,
    jarId,
    type,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
  } = req.query; //đã qua validate.middleware.js (listTransactionQuerySchema)

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
