import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "id không hợp lệ");

// `pendingIncome` lấy từ response POST /transactions/parse (nhánh Thu
// nhập), hoặc user tự nhập thủ công { amount, description, transactionDate }
export const pendingIncomeSchema = z.object({
  amount: z.number().positive("Số tiền phải lớn hơn 0"),
  description: z.string().trim().optional().default(""),
  rawText: z.string().optional(),
  transactionDate: z.coerce.date().optional(),
});

export const confirmIncomeSchema = z
  .object({
    pendingIncome: pendingIncomeSchema,
    incomeType: z.enum(["standard_split", "targeted"]),
    targetJarId: objectIdSchema.optional(),
    // true: chỉ trả bảng phân bổ để preview, KHÔNG lưu.
    // false (mặc định): lưu chính thức ngay - đúng luồng "1 bước xác nhận"
    // đã mô tả ở Data Model muc 10 (client tự hiển thị bảng chia tiền từ
    // chính response /transactions/parse, không cần round-trip preview).
    preview: z.boolean().optional().default(false),
  })
  .refine(
    (data) => data.incomeType !== "targeted" || Boolean(data.targetJarId),
    {
      message: "targetJarId là bắt buộc khi incomeType = targeted",
      path: ["targetJarId"],
    },
  );
