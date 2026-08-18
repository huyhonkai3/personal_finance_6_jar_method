// Nghiệp vụ mượn tiền giữa các lọ - US6.1..US6.3.
import { Jar } from "../models/Jar.js";
import { Transaction } from "../models/Transaction.js";
import { AppError } from "../utils/AppError.js";
import { getOrCreateCurrentPeriod } from "./periodService.js";
import { adjustJarBalance } from "./jarBalanceService.js";
import { recordTransfer } from "./jarPeriodStatService.js";
import { createDebt } from "./debtService.js";

export function rankBorrowingCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const groupA = a.sensitivityGroup === "flexible" ? 0 : 1;
    const groupB = b.sensitivityGroup === "flexible" ? 0 : 1;
    if (groupA !== groupB) return groupA - groupB;
    return (b.balance ?? 0) - (a.balance ?? 0);
  });
}

export async function suggestBorrowingSource(userId, jarId, shortfallAmount) {
  const targetJar = await Jar.findOne({ _id: jarId, userId }).lean();
  if (!targetJar) {
    throw new AppError(
      404,
      "JAR_NOT_FOUND",
      "Không tìm thấy lọ đang thiếu tiền",
    );
  }

  const candidates = await Jar.find({
    userId,
    _id: { $ne: jarId },
    balance: { $gt: 0 },
  }).lean();

  const ranked = rankBorrowingCandidates(candidates);
  const suggested = ranked[0] ?? null;

  return {
    targetJarId: targetJar._id,
    shortfallAmount,
    suggestedJar: suggested
      ? {
          jarId: suggested._id,
          key: suggested.key,
          displayName: suggested.displayName,
          balance: suggested.balance,
          sensitivityGroup: suggested.sensitivityGroup,
          coversShortfall: suggested.balance >= shortfallAmount,
        }
      : null,
  };
}

export async function createBorrowTransfer(
  {
    userId,
    fromJarId,
    toJarId,
    amount,
    note = "",
    transactionDate = new Date(),
    trigger = "manual",
    relatedExpenseTransactionId = null,
    confirmSensitiveWarning = false,
  },
  session,
) {
  if (String(fromJarId) === String(toJarId)) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Lọ nguồn và lọ đích phải khác nhau",
    );
  }

  let jarsQuery = Jar.find({
    userId,
    _id: { $in: [fromJarId, toJarId] },
  });
  if (session) jarsQuery = jarsQuery.session(session);
  const jars = await jarsQuery;
  const fromJar = jars.find((jar) => String(jar._id) === String(fromJarId));
  const toJar = jars.find((jar) => String(jar._id) === String(toJarId));

  if (!fromJar || !toJar) {
    throw new AppError(
      404,
      "JAR_NOT_FOUND",
      "Không tìm thấy lọ nguồn hoặc lọ đích",
    );
  }

  if (fromJar.sensitivityGroup === "sensitive" && !confirmSensitiveWarning) {
    throw new AppError(
      409,
      "SENSITIVE_JAR_CONFIRMATION_REQUIRED",
      `Đây là lọ dài hạn (${fromJar.displayName}). Vui lòng xác nhận trước khi mượn tiền từ lọ này`,
      {
        jarId: fromJar._id,
        displayName: fromJar.displayName,
        amount,
      },
    );
  }

  if (fromJar.balance < amount) {
    throw new AppError(
      422,
      "INSUFFICIENT_SOURCE_BALANCE",
      "Lọ nguồn không đủ số dư để thực hiện khoản mượn",
      { availableBalance: fromJar.balance, requestedAmount: amount },
    );
  }

  const period = await getOrCreateCurrentPeriod(userId, transactionDate);
  const [transaction] = await Transaction.create(
    [
      {
        userId,
        type: "transfer",
        amount,
        rawText: null,
        description: note,
        transactionDate,
        periodId: period._id,
        source: trigger === "manual" ? "manual" : "system",
        transferMeta: {
          fromJarId,
          toJarId,
          trigger,
          relatedExpenseTransactionId,
          debtId: null,
        },
      },
    ],
    session ? { session } : undefined,
  );

  const debt = await createDebt(
    {
      userId,
      debtorJarId: toJarId,
      creditorJarId: fromJarId,
      amount,
      originTransferTransactionId: transaction._id,
    },
    session,
  );

  transaction.transferMeta.debtId = debt._id;
  await transaction.save(session ? { session } : undefined);

  await Promise.all([
    adjustJarBalance(fromJarId, -amount, session),
    adjustJarBalance(toJarId, amount, session),
    recordTransfer(userId, fromJarId, toJarId, period._id, amount, session),
  ]);

  return { transaction, debt, fromJar, toJar };
}
