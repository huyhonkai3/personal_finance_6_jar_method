// Đọc & validate biến môi trường:
// PORT, MONGODB_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

// Fail-fast: nếu thiếu/sai bất kỳ biến nào, log lỗi rõ ràng và thoát process ngay
// khi khởi động, thay vì để lỗi xuất hiện rải rác lúc runtime.
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
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

  JWT_ACCESS_SECRET: z
    .string({ required_error: "JWT_ACCESS_SECRET là bắt buộc" })
    .min(1, "JWT_ACCESS_SECRET không được để trống"),

  JWT_REFRESH_SECRET: z
    .string({ required_error: "JWT_REFRESH_SECRET là bắt buộc" })
    .min(1, "JWT_REFRESH_SECRET không được để trống"),

  CORS_ORIGIN: z
    .string({ required_error: "CORS_ORIGIN là bắt buộc" })
    .min(1, "CORS_ORIGIN không được để trống"),
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
