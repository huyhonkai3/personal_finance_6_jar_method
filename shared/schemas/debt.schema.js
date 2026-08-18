import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "id không hợp lệ");

export const debtIdParamSchema = z.object({ id: objectIdSchema });

export const listDebtsQuerySchema = z.object({
  status: z.enum(["outstanding", "partially_repaid", "settled"]).optional(),
  jarId: objectIdSchema.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});
