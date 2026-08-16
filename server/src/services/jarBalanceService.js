// Cập nhật Jar.balance (denormalized cache) mỗi khi tạo/sửa/xoá Transaction.
// Tách thành helper dùng chung, tái sử dụng ở mọi giai đoạn có tác động đến
// số dư lọ (Thu nhập - Giai đoạn 4, Mượn tiền - Giai đoạn 7, Recalculation
// Engine - Giai đoạn 8...), tránh lặp lại logic $inc rải rác nhiều nơi.
import { Jar } from "../models/Jar.js";

/**
 * Cộng/trừ vào Jar.balance bằng $inc - atomic ở tầng DB, tránh race
 * condition khi nhiều request cùng lúc tác động 1 lọ (VD 2 khoản chi cùng
 * lúc trừ vào cùng 1 lọ).
 *
 * @param {import("mongoose").Types.ObjectId | string} jarId
 * @param {number} delta - dương: tăng số dư (thu nhập, hoàn trả nợ...),
 *   âm: giảm số dư (chi tiêu, mượn tiền ra khỏi lọ...)
 * @param {import("mongoose").ClientSession} [session] - dùng khi cần chạy
 *   trong 1 Mongo transaction (VD bulk-confirm - US1.5 AC5)
 */
export async function adjustJarBalance(jarId, delta, session) {
  if (!delta) return; // delta = 0 -> không cần đụng DB
  await Jar.updateOne(
    { _id: jarId, $inc: { balance: delta } },
    session ? { session } : undefined,
  );
}
