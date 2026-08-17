import { describe, expect, it } from "vitest";
import { calculateClosingBalance } from "./periodService.js";
import { getPeriodBounds } from "../utils/date.js";

describe("periodService - Giai đoạn 6", () => {
  it("tính closingBalance từ đúng số liệu của kỳ", () => {
    expect(
      calculateClosingBalance({
        openingBalance: 1_000_000,
        allocatedIncome: 2_000_000,
        totalExpense: 750_000,
        totalTransferIn: 100_000,
        totalTransferOut: 50_000,
        totalAdjustment: -25_000,
      }),
    ).toBe(2_275_000);
  });

  it("tính đúng mốc tháng theo Asia/Ho_Chi_Minh", () => {
    const bounds = getPeriodBounds(
      new Date("2026-08-18T00:00:00.000Z"),
      1,
      "Asia/Ho_Chi_Minh",
    );

    expect(bounds.periodKey).toBe("2026-08");
    expect(bounds.startDate.toISOString()).toBe("2026-07-31T17:00:00.000Z");
    expect(bounds.endDate.toISOString()).toBe("2026-08-31T16:59:59.999Z");
  });

  it("hỗ trợ chu kỳ bắt đầu ngày 5 theo timezone user", () => {
    const bounds = getPeriodBounds(
      new Date("2026-08-18T00:00:00.000Z"),
      5,
      "Asia/Ho_Chi_Minh",
    );

    expect(bounds.periodKey).toBe("2026-08");
    expect(bounds.startDate.toISOString()).toBe("2026-08-04T17:00:00.000Z");
    expect(bounds.endDate.toISOString()).toBe("2026-09-04T16:59:59.999Z");
  });
});
