// Zod schema: validate body cho /transactions/parse, /parse-bulk,
// /bulk-confirm, PATCH /transactions/:id/jar (Giai đoạn 3).
// (expense-followup, PATCH /transactions/:id - để dành Giai đoạn 7, 8)
import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "id không hợp lệ");

// Body của POST /transactions/parse
export const parseTransactionSchema = z.object({
  rawText: z.string().trim().min(1, "Nội dung không được để trống"),
  transactionDate: z.coerce.date().optional(),
});

// Body của POST /transactions/parse-bulk
export const parseBulkTransactionSchema = z.object({
  rawText: z.string().trim().min(1, "Nội dung không được để trống"),
  transactionDate: z.coerce.date().optional(),
});

// 1 item trong mảng `items` gửi lên POST /transactions/bulk-confirm - chính
// là staging item trả về từ /parse-bulk, có thể đã được user sửa lại ở màn
// hình Review (US1.5 AC2) trước khi gửi lên.
export const bulkConfirmItemSchema = z.object({
  clientLineId: z.string().min(1),
  amount: z.number().positive().nullable(),
  description: z.string(),
  jarId: objectIdSchema.nullable(),
  isPredicted: z.boolean(),
  isParseError: z.boolean(),
  isIncome: z.boolean(),
});

// Body của POST /transactions/bulk-confirm
export const bulkConfirmSchema = z.object({
  items: z.array(bulkConfirmItemSchema).min(1, "Không có dòng nào để lưu"),
  transactionDate: z.coerce.date().optional(),
});

// Body của PATCH /transactions/:id/jar
export const updateTransactionJarSchema = z.object({
  jarId: objectIdSchema,
});

// Param :id trên các route /transactions/:id...
export const transactionIdParamSchema = z.object({
  id: objectIdSchema,
  periodId: objectIdSchema.optional(),
  jarId: objectIdSchema.optional(),
  type: z.enum(["expense", "income", "transfer", "adjustment"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// Query params của GET /transactions
export const listTransactionsQuerySchema = z.object({
  periodId: objectIdSchema.optional(),
  jarId: objectIdSchema.optional(),
  type: z.enum[("expense", "income", "transfer", "adjustment")].optional(),
});
