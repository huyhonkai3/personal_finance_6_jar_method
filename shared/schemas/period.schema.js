import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "id không hợp lệ");

export const periodIdParamSchema = z.object({
  id: objectIdSchema,
});

export const closePeriodSchema = z.object({
  decisions: z
    .array(
      z.object({
        jarId: objectIdSchema,
        action: z.enum(["rollover", "sweep"]),
      }),
    )
    .length(6, "Cần có quyết định cho đủ 6 lọ")
    .refine(
      (decisions) => new Set(decisions.map((item) => item.jarId)).size === decisions.length,
      "Mỗi lọ chỉ được có một quyết định",
    ),
});
