import { describe, expect, it } from "vitest";
import {
  calculatePercentageUsed,
  getCrossedThresholds,
} from "./thresholdWatcher.js";

describe("thresholdWatcher - Giai đoạn 5", () => {
  it("tính đúng phần trăm đã dùng", () => {
    expect(calculatePercentageUsed(800_000, 1_000_000)).toBe(80);
    expect(calculatePercentageUsed(900_000, 1_000_000)).toBe(90);
  });

  it("không tính ngưỡng khi spendingLimit <= 0", () => {
    expect(calculatePercentageUsed(100_000, 0)).toBeNull();
  });

  it("phát ngưỡng 80 một lần và không lặp trước 90", () => {
    expect(getCrossedThresholds(82, {})).toEqual([80]);
    expect(
      getCrossedThresholds(85, { threshold80: true, threshold90: false }),
    ).toEqual([]);
  });

  it("phát ngưỡng 90 sau khi 80 đã được gửi", () => {
    expect(
      getCrossedThresholds(91, { threshold80: true, threshold90: false }),
    ).toEqual([90]);
    expect(
      getCrossedThresholds(95, { threshold80: true, threshold90: true }),
    ).toEqual([]);
  });
});
