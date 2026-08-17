// POST /income/confirm — muc 10
// Giai đoạn 4: chỉ xử lý Standard Split (US2.2) và Targeted (US2.3).
// CHƯA trích trả nợ (US6.4) - allocationService.allocateIncome() đã để lại
// điểm nối rõ ràng (TODO Giai đoạn 7), không cần sửa gì ở controller này
// khi Giai đoạn 7 hoàn thiện debtService.
import { Jar } from "../models/Jar.js";
import { Transaction } from "../models/Transaction.js";
import { getOrCreatecurrentPeriod } from "../services/periodService.js";
import { allocateIncome } from "../services/allocationService.js";
import { adjustJarBalance } from "../services/jarBalanceService.js";
import { recordAllocatedIncome } from "../services/jarPeriodStatService.js";

export async function confirmIncome(req, res) {
  // req.body đã qua validate.middleware.js (confirmIncomeSchema)
  const { pendingIncome, incomeType, targetJarId, preview } = req.body;
  const { amount, description, rawText, transactionDate } = pendingIncome;
  const effectiveDate = transactionDate ?? new Date();

  const { allocations, ratioSnapshot } = await allocateIncome(
    req.userId,
    amount,
    incomeType,
    targetJarId,
  );

  // preview: true -> chỉ trả bảng phân bổ để client hiển thị trước khi user bấm "Xác nhận"
  // (US 2.2 AC1) - không lưu gì cả.
  if (preview) {
    return res.status(200).json({ preview: { allocations, ratioSnapshot } });
  }

  const period = await getOrCreatecurrentPeriod(req.userId, effectiveDate);

  const [transaction] = await Transaction.create([
    {
      userId: req.userId,
      type: "income",
      amount,
      rawText: rawText ?? null,
      description,
      transactionDate: effectiveDate,
      periodId: period._id,
      // Chỉ targeted mới gắn thẳng vào 1 jarId cụ thể (giống expense)
      // Standar Split trải trên nhiều lọ nên jarId ở cấp Transaction để null,
      // chi tiết từng lọ nằm trong incomeMeta.allocations.
      jarId: incomeType === "targeted" ? targetJarId : null,
      source: rawText ? "realtime" : "manual",
      incomeMeta: {
        incomeType,
        ratioSnapshot,
        allocations,
        debtRepayments: [], // Giai đoạn 7 sẽ điền khi khi debtService sẵn sàng
      },
    },
  ]);

  // Cộng vào Jar.balance (cache) và JarPeriodStat.allocatedIncome cho từng
  // lọ theo đúng bảng phân bổ vừa tính.
  await Promise.all(
    allocations.map((allocation) =>
      Promise.all(
        adjustJarBalance(allocation.jarId, allocation.amount),
        recordAllocatedIncome(
          req.userId,
          allocation.jarId,
          period._id,
          allocation.amount,
        ),
      ),
    ),
  );

  const jars = await Jar.find({ userId: req.userId }).sort({ order: 1 });

  res.status(201).json({ transaction, jars });
}
