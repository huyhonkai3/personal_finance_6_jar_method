import { describe, expect, it } from "vitest";
import {
  calculateEditWindowStart,
  isWithinEditWindow,
} from "./editWindowGuard.middleware.js";

describe("editWindowGuard - Giai đoạn 8", () => {
  const now = new Date("2026-08-18T05:00:00.000Z");
  const timezone = "Asia/Ho_Chi_Minh";

  it("cho phép từ đầu tháng thứ 12 gần nhất", () => {
    expect(calculateEditWindowStart(now, timezone).toISOString()).toBe(
      "2025-08-31T17:00:00.000Z",
    );
    expect(
      isWithinEditWindow(
        new Date("2025-08-31T17:00:00.000Z"),
        now,
        timezone,
      ),
    ).toBe(true);
  });

  it("từ chối dữ liệu nằm trước cửa sổ 12 tháng", () => {
    expect(
      isWithinEditWindow(
        new Date("2025-08-31T16:59:59.999Z"),
        now,
        timezone,
      ),
    ).toBe(false);
  });

  it("không cho phép transactionDate ở tương lai", () => {
    expect(
      isWithinEditWindow(
        new Date("2026-08-19T00:00:00.000Z"),
        now,
        timezone,
      ),
    ).toBe(false);
  });
});
