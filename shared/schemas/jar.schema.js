// Zod schema: validate PUT /jars/ratios (tong percentage = 100)
// Dùng chung được ở cả Frontend (React Hook Form) lẫn Backend (validate.middleware.js).
import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "jarId không hợp lệ");

export const jarRatioItemSchema = z.object({
  jarId: objectIdSchema,
  percentage: z
    .number({ invalid_type_error: "percentage phải là số" })
    .min(0, "Tỷ lệ phải >= 0")
    .max(100, "Tỷ lệ phải <= 100"),
});

// Body của PUT /jars/ratios: mảng đúng 6 phần tử (mỗi user luôn có đúng 6 lọ).
// LƯU Ý: việc validate "tổng = 100" KHÔNG đặt ở schema này. Đó là một mã lỗi
// nghiệp vụ riêng (409 JAR_RATIO_NOT_100 - xem Data Model muc 5), được kiểm
// tra trong jar.controller.js, tách biệt với lỗi 422 VALIDATION_ERROR (sai
// định dạng/kiểu dữ liệu) do schema này phụ trách.
export const updateJarRatiosSchema = z
  .array(jarRatioItemSchema)
  .length(6, "Phải gửi đủ tỷ lệ cho cả 6 lọ");

// Body của PATCH /jars/:jarId - chỉ cho phép đổi displayName (key và
// percentage không đổi qua endpoint này).
export const updateJarDisplayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Tên lọ không được để trống")
    .max(100, "Tên lọ tối đa 100 ký tự"),
});

// Param :jarId trên các route /jars/:jarId... - validate sớm để trả
// 422 VALIDATION_ERROR thay vì để Mongoose CastError rơi xuống thành lỗi
// 500 không rõ ràng khi ai đó gửi 1 chuỗi không phải ObjectId.
export const jarIdParamSchema = z.object({
  jarId: objectIdSchema,
});
