// Validate request body (hoặc params/query) bằng Zod schema (dùng chung
// với shared/schemas). Trên thành công, `req[source]` được thay bằng dữ
// liệu đã qua `schema.parse` (đã coerce/strip đúng kiểu); trên thất bại,
// trả lỗi thống nhất 422 VALIDATION_ERROR kèm chi tiết field lỗi.
import { AppError } from "../utils/AppError.js";

/**
 * @param {import("zod").ZodSchema} schema
 * @param {"body" | "params" | "query"} [source]
 */
export function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        new AppError(
          422,
          "VALIDATION_ERROR",
          "Dữ liệu gửi lên không hợp lệ",
          result.error.flatten(),
        ),
      );
    }
    req[source] = result.data;
    next();
  };
}
