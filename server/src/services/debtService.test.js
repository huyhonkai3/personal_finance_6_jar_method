import { describe, expect, it } from "vitest";
import { calculateDebtRepaymentPlan } from "./debtService.js";

const debt = (id, remainingAmount, createdAt) => ({
  _id: id,
  debtorJarId: `debtor-${id}`,
  creditorJarId: `creditor-${id}`,
  remainingAmount,
  createdAt: new Date(createdAt),
});

describe("debtService - Giai đoạn 7", () => {
  it("ưu tiên trả khoản nợ cũ nhất trước", () => {
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

  it("thu nhập không đủ thì trả một phần và dừng", () => {
    const result = calculateDebtRepaymentPlan(250_000, [
      debt("first", 400_000, "2026-08-01T00:00:00Z"),
      debt("second", 100_000, "2026-08-02T00:00:00Z"),
    ]);

    expect(result.repayments).toHaveLength(1);
    expect(result.repayments[0].debtId).toBe("first");
    expect(result.repayments[0].amount).toBe(250_000);
    expect(result.remainingIncome).toBe(0);
  });

  it("chỉ chia phần thu nhập còn lại sau khi đủ tiền trả hết nợ", () => {
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
