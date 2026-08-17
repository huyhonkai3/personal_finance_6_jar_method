import { describe, expect, it } from "vitest";

import {
  calculatePercentageUsed,
  getCrossedThresholds,
} from "./thresholdWatcher.js";

describe("thresholdWatcher", () => {
  it("tính đúng phần trăm chi tiêu đã dùng", () => {
    expect(calculatePercentageUsed(800_000, 1_000_000)).toBe(80);
    expect(calculatePercentageUsed(900_000, 1_000_000)).toBe(90);
  });

  it("không tính ngưỡng khi spendingLimit chưa có", () => {
    expect(calculatePercentageUsed(100_000, 0)).toBeNull();
  });

  it("phát ngưỡng 80 khi vừa vượt 80%", () => {
    expect(
      getCrossedThresholds(82, { threshold80: false, threshold90: false }),
    ).toEqual([80]);
  });

  it("không gửi lặp ngưỡng 80 trước khi chạm 90", () => {
    expect(
      getCrossedThresholds(85, { threshold80: true, threshold90: false }),
    ).toEqual([]);
  });

  it("phát ngưỡng 90 sau khi ngưỡng 80 đã được gửi", () => {
    expect(
      getCrossedThresholds(91, { threshold80: true, threshold90: false }),
    ).toEqual([90]);
  });

  it("không gửi lại ngưỡng đã được đánh dấu", () => {
    expect(
      getCrossedThresholds(95, { threshold80: true, threshold90: true }),
    ).toEqual([]);
  });
});
