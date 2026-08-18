import { describe, expect, it } from "vitest";
import { calculateDebtRepaymentPlan } from "./debtService.js";

function debt(id, remainingAmount, createdAt) {
  return {
    _id: id,
    debtorJarId: `debtor-${id}`,
    creditorJarId: `creditor-${id}`,
    remainingAmount,
    createdAt: new Date(createdAt),
  };
}

describe("debtService - FIFO repayment", () => {
  it("trả khoản nợ cũ nhất trước", () => {
    const result = calculateDebtRepaymentPlan(700_000, [
      debt("new", 500_000, "2026-08-10T00:00:00Z"),
      debt("old", 400_000, "2026-08-01T00:00:00Z"),
    ]);

    expect(result.repayments.map((item) => [item.debtId, item.amount])).toEqual([
      ["old", 400_000],
      ["new", 300_000],
    ]);
    expect(result.remainingIncome).toBe(0);
  });

  it("giữ phần income còn lại sau khi trả hết nợ", () => {
    const result = calculateDebtRepaymentPlan(1_000_000, [
      debt("first", 200_000, "2026-08-01T00:00:00Z"),
      debt("second", 300_000, "2026-08-02T00:00:00Z"),
    ]);

    expect(result.repayments.reduce((sum, item) => sum + item.amount, 0)).toBe(
      500_000,
    );
    expect(result.remainingIncome).toBe(500_000);
  });
});
