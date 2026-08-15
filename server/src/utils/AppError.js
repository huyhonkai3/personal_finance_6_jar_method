// Custom Error class: { statusCode, code, message, details }
// Dung cho cac ma loi nghiep vu: JAR_RATIO_NOT_100, UNPARSEABLE_LINE,
// MONTH_END_PENDING, EDIT_WINDOW_EXCEEDED, SENSITIVE_JAR_CONFIRMATION_REQUIRED
// response lỗi thống nhất: { error: { code, message, details }}
export class AppError extends Error {
  /**
   * @param {number} statusCode - HTTP status code, ví dụ 404, 409, 422
   * @param {string} code - Mã lỗi nghiệp vụ, ví dụ 'JAR_RATIO_NOT_100'
   * @param {string} message - Thông điệp lỗi hiển thị được cho người dùng
   * @param {object} [details] - Thông tin chi tiết bổ sung (optional)
   */
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    Error.captureStackTrace?.(this, this.constructor);
  }
}
