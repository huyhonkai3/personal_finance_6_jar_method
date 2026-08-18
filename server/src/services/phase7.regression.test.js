import { describe, expect, it } from "vitest";
import { rankBorrowingCandidates } from "./transferService.js";

describe("Giai đoạn 7 regression - borrowing suggestion", () => {
  it("ưu tiên lọ có thể cover shortfall trước rồi mới xét sensitivity", () => {
    const ranked = rankBorrowingCandidates(
      [
        {
          _id: "play",
          sensitivityGroup: "flexible",
          balance: 100_000,
        },
        {
          _id: "savings",
          sensitivityGroup: "sensitive",
          balance: 900_000,
        },
        {
          _id: "education",
          sensitivityGroup: "flexible",
          balance: 700_000,
        },
      ],
      500_000,
    );

    expect(ranked.map((jar) => jar._id)).toEqual([
      "education",
      "savings",
      "play",
    ]);
  });
});
