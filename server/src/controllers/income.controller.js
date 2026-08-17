// POST /income/confirm — muc 10
// Giai đoạn 4: Standard Split (US2.2) và Targeted (US2.3).
// CHƯA trích trả nợ (US6.4) - để Giai đoạn 7 hoàn thiện debtService.
import { Jar } from "../models/Jar.js";
import { Transaction } from "../models/Transaction.js";
import { getOrCreateCurrentPeriod } from "../services/periodService.js";
import { allocateIncome } from "../services/allocationService.js";
import { adjustJarBalance } from "../services/jarBalanceService.js";
import { recordAllocatedIncome } from "../services/jarPeriodStatService.js";

export async function confirmIncome(req, res) {
  const { pendingIncome, incomeType, targetJarId, preview } = req.body;
  const { amount, description, rawText, transactionDate } = pendingIncome;
  const effectiveDate = transactionDate ?? new Date();

  const { allocations, ratioSnapshot } = await allocateIncome(
    req.userId,
    amount,
    incomeType,
    targetJarId,
  );

  if (preview) {
    return res.status(200).json({ preview: { allocations, ratioSnapshot } });
  }

  const period = await getOrCreateCurrentPeriod(req.userId, effectiveDate);

  const [transaction] = await Transaction.create([
    {
      userId: req.userId,
      type: "income",
      amount,
      rawText: rawText ?? null,
      description,
      transactionDate: effectiveDate,
      periodId: period._id,
      jarId: incomeType === "targeted" ? targetJarId : null,
      source: rawText ? "realtime" : "manual",
      incomeMeta: {
        incomeType,
        ratioSnapshot,
        allocations,
        debtRepayments: [],
      },
    },
  ]);

  await Promise.all(
    allocations.flatMap((allocation) => [
      adjustJarBalance(allocation.jarId, allocation.amount),
      recordAllocatedIncome(
        req.userId,
        allocation.jarId,
        period._id,
        allocation.amount,
      ),
    ]),
  );

  const jars = await Jar.find({ userId: req.userId }).sort({ order: 1 });

  res.status(201).json({ transaction, jars });
}
