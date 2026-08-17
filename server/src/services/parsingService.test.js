import { describe, expect, it } from "vitest";

import { detectIsIncome } from "./parsingService.js";

describe("detectIsIncome", () => {
  it.each([
    "Nhận lương 15 triệu",
    "Thưởng dự án 2tr",
    "Mẹ cho 500k - được cho",
    "Hoàn tiền 120k",
    "Bán được điện thoại 3 triệu",
  ])("nhận diện đúng khoản Thu: %s", (rawText) => {
    expect(detectIsIncome(rawText)).toBe(true);
  });

  it.each([
    "Ăn trưa 30k",
    "Đổ xăng 50k",
    "Mua sách 120k",
  ])("không nhận nhầm khoản Chi thành Thu: %s", (rawText) => {
    expect(detectIsIncome(rawText)).toBe(false);
  });
});
