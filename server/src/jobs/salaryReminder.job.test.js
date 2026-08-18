import { describe, expect, it } from "vitest";
import { isSalaryReminderDueToday } from "./salaryReminder.job.js";

describe("salaryReminder timezone regression", () => {
  it("dùng ngày theo timezone user thay vì ngày của server/UTC", () => {
    const reference = new Date("2026-08-31T17:30:00.000Z");

    expect(
      isSalaryReminderDueToday(1, reference, "Asia/Ho_Chi_Minh"),
    ).toBe(true);
    expect(isSalaryReminderDueToday(31, reference, "UTC")).toBe(true);
  });
});
