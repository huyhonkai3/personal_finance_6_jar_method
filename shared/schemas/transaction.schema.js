// Zod schema cho Transaction APIs.
import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "id không hợp lệ");

export const parseTransactionSchema = z.object({
  rawText: z.string().trim().min(1, "Nội dung không được để trống"),
  transactionDate: z.coerce.date().optional(),
});

export const parseBulkTransactionSchema = z.object({
  rawText: z.string().trim().min(1, "Nội dung không được để trống"),
  transactionDate: z.coerce.date().optional(),
});

export const bulkConfirmItemSchema = z.object({
  clientLineId: z.string().min(1),
  rawText: z.string().optional(),
  amount: z.number().positive().nullable(),
  description: z.string(),
  jarId: objectIdSchema.nullable(),
  isPredicted: z.boolean(),
  isParseError: z.boolean(),
  isIncome: z.boolean(),
});

export const bulkConfirmSchema = z.object({
  items: z.array(bulkConfirmItemSchema).min(1, "Không có dòng nào để lưu"),
  transactionDate: z.coerce.date().optional(),
});

const pendingExpenseSchema = z.object({
  amount: z.number().positive(),
  rawText: z.string().optional(),
  description: z.string().optional().default(""),
  jarId: objectIdSchema,
  isPredicted: z.boolean().optional().default(false),
  predictionConfidence: z.number().min(0).max(1).nullable().optional(),
  matchedDictionaryRuleId: objectIdSchema.nullable().optional(),
  transactionDate: z.coerce.date().optional(),
});

export const expenseFollowupSchema = z
  .object({
    pendingExpense: pendingExpenseSchema,
    decision: z.enum(["borrow", "skip"]),
    borrowFromJarId: objectIdSchema.optional(),
    confirmSensitiveWarning: z.boolean().optional().default(false),
  })
  .refine(
    (data) => data.decision !== "borrow" || Boolean(data.borrowFromJarId),
    {
      message: "borrowFromJarId là bắt buộc khi decision = borrow",
      path: ["borrowFromJarId"],
    },
  );

export const updateTransactionJarSchema = z.object({ jarId: objectIdSchema });

export const updateTransactionSchema = z
  .object({
    amount: z.number().positive().optional(),
    jarId: objectIdSchema.optional(),
    transactionDate: z.coerce.date().optional(),
  })
  .refine(
    (value) =>
      value.amount !== undefined ||
      value.jarId !== undefined ||
      value.transactionDate !== undefined,
    "Cần cung cấp ít nhất một field để cập nhật",
  );

export const transactionIdParamSchema = z.object({ id: objectIdSchema });

export const listTransactionsQuerySchema = z.object({
  periodId: objectIdSchema.optional(),
  jarId: objectIdSchema.optional(),
  type: z.enum(["expense", "income", "transfer", "adjustment"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});
