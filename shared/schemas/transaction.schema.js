// Zod schema: validate body cho /transactions/parse, /parse-bulk,
// /bulk-confirm, PATCH /transactions/:id/jar (Giai đoạn 3).
// (expense-followup, PATCH /transactions/:id - để dành Giai đoạn 7, 8)
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

export const updateTransactionJarSchema = z.object({
  jarId: objectIdSchema,
});

export const transactionIdParamSchema = z.object({
  id: objectIdSchema,
});

export const listTransactionsQuerySchema = z.object({
  periodId: objectIdSchema.optional(),
  jarId: objectIdSchema.optional(),
  type: z.enum(["expense", "income", "transfer", "adjustment"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
