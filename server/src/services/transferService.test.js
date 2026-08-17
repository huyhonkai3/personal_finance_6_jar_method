import { describe, expect, it } from "vitest";
import { rankBorrowingCandidates } from "./transferService.js";

describe("transferService - borrowing suggestion", () => {
  it("ưu tiên lọ flexible trước sensitive dù sensitive có số dư lớn hơn", () => {
    const ranked = rankBorrowingCandidates([
      { _id: "savings", sensitivityGroup: "sensitive", balance: 5_000_000 },
      { _id: "play", sensitivityGroup: "flexible", balance: 500_000 },
      { _id: "education", sensitivityGroup: "flexible", balance: 900_000 },
    ]);

    expect(ranked.map((jar) => jar._id)).toEqual([
      "education",
      "play",
      "savings",
    ]);
  });
});
