// Xử lý phân bổ thu nhập: targeted hoặc trả nợ trước rồi standard split.
import { Jar } from "../models/Jar.js";
import { AppError } from "../utils/AppError.js";
import { repayOutstandingDebts } from "./debtService.js";

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

export function calculateTargetedAllocation(amount, targetJarId) {
  return [{ jarId: targetJarId, amount }];
}

/**
 * Hàm này chỉ TÍNH preview. Debt thực sự chỉ bị giảm sau khi user xác nhận
 * income ở controller, tránh preview làm thay đổi dữ liệu.
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
      debtRepayments: [],
      remainingIncome: amount,
    };
  }

  const { repayments: debtRepayments, remainingIncome } =
    await repayOutstandingDebts(userId, amount);

  const allocations = calculateStandardSplitAllocations(
    remainingIncome,
    jars.map((jar) => ({ jarId: jar._id, percentage: jar.percentage })),
  );
  const ratioSnapshot = jars.map((jar) => ({
    jarKey: jar.key,
    percentage: jar.percentage,
  }));

  return { allocations, ratioSnapshot, debtRepayments, remainingIncome };
}
