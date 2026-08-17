import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "id không hợp lệ");

export const notificationIdParamSchema = z.object({
  id: objectIdSchema,
});

export const listNotificationsQuerySchema = z.object({
  isRead: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
