// Đọc & validate biến môi trường:
// PORT, NODE_ENV, MONGODB_URI, MONGODB_URI_TEST, JWT_ACCESS_SECRET,
// JWT_REFRESH_SECRET, CORS_ORIGIN
//
// Fail-fast: nếu thiếu/sai bất kỳ biến nào, log lỗi rõ ràng và thoát process ngay
// khi khởi động, thay vì để lỗi xuất hiện rải rác lúc runtime.

import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"], {
      errorMap: () => ({
        message: "NODE_ENV phải là một trong: development | production | test",
      }),
    }),

    PORT: z.coerce
      .number({ invalid_type_error: "PORT phải là số" })
      .int("PORT phải là số nguyên")
      .positive("PORT phải là số dương"),

    MONGODB_URI: z
      .string({ required_error: "MONGODB_URI là bắt buộc" })
      .min(1, "MONGODB_URI không được để trống"),

    // Chỉ bắt buộc khi NODE_ENV=test (xem superRefine bên dưới) — dùng riêng
    // cho integration test (Supertest), không đụng vào MONGODB_URI của dev/prod.
    MONGODB_URI_TEST: z.string().optional(),

    JWT_ACCESS_SECRET: z
      .string({ required_error: "JWT_ACCESS_SECRET là bắt buộc" })
      .min(1, "JWT_ACCESS_SECRET không được để trống"),

    JWT_REFRESH_SECRET: z
      .string({ required_error: "JWT_REFRESH_SECRET là bắt buộc" })
      .min(1, "JWT_REFRESH_SECRET không được để trống"),

    CORS_ORIGIN: z
      .string({ required_error: "CORS_ORIGIN là bắt buộc" })
      .min(1, "CORS_ORIGIN không được để trống"),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "test" && !data.MONGODB_URI_TEST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONGODB_URI_TEST"],
        message: "MONGODB_URI_TEST là bắt buộc khi NODE_ENV=test",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Biến môi trường không hợp lệ. Kiểm tra lại file .env (xem .env.example):",
  );
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
