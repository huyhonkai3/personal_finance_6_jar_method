// Chuan hoa loi tra ve: { error: { code, message, details } }
// Middleware xử lý lỗi tập trung - gắn cuối cùng trong app.js
// Format response: { "error": { "code": "...", "message": "...", "details": {}}}
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const isAppError = err instanceof AppError;

  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : "INTERNAL_SERVER_ERROR";
  const message = isAppError ? err.message : "Đã có lỗi xảy ra ở server";
  const details = isAppError ? err.details : {};

  if (!isAppError) {
    // Lỗi không lường trước (bug, lỗi driver DB...) - luôn log để debug.
    console.error(err);
  }

  const body = { error: { code, message, details } };

  // Chỉ trả stack trace khi ở môi trường development
  if (env.NODE_ENV === "development" && err.stack) {
    body.error.stack = err.stack;
  }

  res.status(statusCode).json(body);
}
