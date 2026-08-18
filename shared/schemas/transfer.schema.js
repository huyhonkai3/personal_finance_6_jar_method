// Zod schemas cho Transfers - Epic 6.
import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "id không hợp lệ");

export const suggestTransferSchema = z.object({
  jarId: objectIdSchema,
  shortfallAmount: z.number().positive("Số tiền thiếu phải lớn hơn 0"),
});

export const createTransferSchema = z
  .object({
    fromJarId: objectIdSchema,
    toJarId: objectIdSchema,
    amount: z.number().positive("Số tiền mượn phải lớn hơn 0"),
    note: z.string().trim().max(500).optional(),
    transactionDate: z.coerce.date().optional(),
    confirmSensitiveWarning: z.boolean().optional().default(false),
  })
  .refine((data) => data.fromJarId !== data.toJarId, {
    message: "Lọ nguồn và lọ đích phải khác nhau",
    path: ["toJarId"],
  });

export const listTransfersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});
