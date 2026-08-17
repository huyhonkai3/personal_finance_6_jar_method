// Xử lý phân bổ thu nhập: standard_split (theo Jar.percentage) hoặc targeted
// (100% vào 1 lọ). Tham chiếu: US2.2, US2.3

// File này tách rõ 2 nhóm hàm, giống parsingService.js:
//   - Hàm THUẦN (không đụng DB): calculateStandardSplitAllocations,
//     calculateTargetedAllocation - dễ unit test độc lập. Đây chính là phần
//     "logic tính toán thuần" mà Technical Stack muc 5 yêu cầu ưu tiên test.
//   - Hàm cần DB (Jar): allocateIncome.
import { Jar } from "../models/Jar.js";
import { AppError } from "../utils/AppError.js";

// HÀM THUẦN

/**
 * Chia `amount` (đồng, số nguyên) cho các lọ theo `percentage` hiện hành,
 * dùng phương pháp "số dư lớn nhất" (Largest Remainder Method) để đảm bảo
 * TỔNG CÁC PHẦN CHIA LUÔN BẰNG ĐÚNG amount GỐC, không mất/dư đồng nào do
 * làm tròn - kể cả khi percentage tạo ra số dư lẻ (VD 33.33%).
 *
 * Cách làm: làm tròn xuống (floor) từng phần theo tỷ lệ, cộng dồn lại phần
 * bị "mất" khi làm tròn xuống, rồi phát phần dư đó (từng đồng một) ưu tiên
 * cho lọ có phần thập phân bị cắt lớn nhất trước.
 *
 * @param {number} amount - số tiền gốc (đồng, số nguyên dương)
 * @param {{ jarId: any, percentage: number }[]} jars
 * @returns {{ jarId: any, amount: number }[]}
 */
export function calculateStandardSplitAllocations(amount, jars) {
  const floored = jars.map((jar) => {
    const exact = (amount * jar.percentage) / 100;
    const floorValue = Math.floor(exact);
    return {
      jarId: jar.jarId,
      amount: floorValue,
      remainder: exact - floorValue,
    };
  });

  let remaining = amount - floored.reduce((sum, item) => sum + item.amount, 0);

  // Ưu tiên phát phần dư cho lọ có phần thập phân bị cắt lớn nhất trước.
  // Lặp vòng tròn (round-robin) qua danh sách đã sắp xếp cho đến khi hết
  // phần dư - đảm bảo đúng bất biến tổng = amount ngay cả trong trường hợp
  // phòng thủ (percentage không cộng đúng 100 vì lý do nào đó).
  const order = [...floored].sort((a, b) => b.remainder - a.remainder);
  let i = 0;
  while (remaining > 0 && order.length > 0) {
    order[i % order.length].amount += 1;
    remaining -= 1;
    i += 1;
  }

  return floored.map(({ jarId, amount: jarAmount }) => ({
    jarId,
    amount: jarAmount,
  }));
}

/**
 * Thu nhập đích danh (Targeted) - 100% vào đúng 1 lọ, không chia - US2.3 AC2.
 * @param {number} amount
 * @param {any} targetJarId
 */
export function calculateTargetedAllocation(amount, targetJarId) {
  return [{ jarId: targetJarId, amount }];
}

// HÀM CẦN DB

/**
 * Tính bảng phân bổ thu nhập cho 1 user, dựa trên `Jar.percentage` hiện
 * hành (Standard Split) hoặc lọ đích chỉ định (Targeted).
 *
 * CHƯA gọi debtService ở bước này (Giai đoạn 4 chưa có InternalDebt model).
 * TODO Giai đoạn 7: trước khi chia theo tỷ lệ (nhánh standard_split), gọi
 * debtService.repayOutstandingDebts(userId, amount) để trích trả nợ nội bộ
 * trước, chỉ chia phần còn lại theo % - US6.4 AC2/AC3. Chỉ để lại điểm nối
 * rõ ràng ở đây (không sửa cấu trúc hàm/response sau này).
 *
 * @param {import("mongoose").Types.ObjectId | string} userId
 * @param {number} amount
 * @param {"standard_split" | "targeted"} incomeType
 * @param {import("mongoose").Types.ObjectId | string} [targetJarId] - bắt buộc khi incomeType='targeted'
 */
export async function allocateIncome(userId, amount, incomeType, targetJarId) {
  const jars = await Jar.find({ userId }).sort({ order: 1 });
  if (jars.length !== 6) {
    throw new AppError(
      500,
      "JAR_SETUP_INCOMPLETE",
      "Tài khoản chưa có đủ 6 lọ mặc định",
    );
  }

  if (incomeType === "targeted") {
    const targetJar = jars.find(
      (jar) => String(jar._id) === String(targetJarId),
    );
    if (!targetJar) {
      throw new AppError(404, "JAR_NOT_FOUND", "Không tìm thấy lọ đích");
    }
    return {
      allocations: calculateTargetedAllocation(amount, targetJar._id),
      ratioSnapshot: [],
    };
  }

  // standard_split (mặc định)
  const allocations = calculateStandardSplitAllocations(
    amount,
    jars.map((jar) => ({ jarId: jar._id, percentage: jar.percentage })),
  );
  const ratioSnapshot = jars.map((jar) => ({
    jarKey: jar.key,
    percentage: jar.percentage,
  }));

  return { allocations, ratioSnapshot };
}
