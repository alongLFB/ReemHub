import { describe, expect, it } from "vitest";
import { calculateExpenseSplits, calculateSettlement, formatAed } from "./calculator";

describe("calculateExpenseSplits", () => {
  it("distributes an equal-split rounding remainder deterministically", () => {
    expect(calculateExpenseSplits(100, {
      method: "EQUAL",
      participantIds: ["charlie", "alice", "bob"],
    })).toEqual([
      { participantId: "alice", amountFils: 34 },
      { participantId: "bob", amountFils: 33 },
      { participantId: "charlie", amountFils: 33 },
    ]);
  });

  it("supports exact amounts, percentages, and shares", () => {
    expect(calculateExpenseSplits(30_000, {
      method: "EXACT_AMOUNT",
      amounts: [
        { participantId: "a", amountFils: 15_000 },
        { participantId: "b", amountFils: 10_000 },
        { participantId: "c", amountFils: 5_000 },
      ],
    })).toHaveLength(3);
    expect(calculateExpenseSplits(30_000, {
      method: "PERCENTAGE",
      percentages: [
        { participantId: "a", basisPoints: 5_000 },
        { participantId: "b", basisPoints: 3_000 },
        { participantId: "c", basisPoints: 2_000 },
      ],
    })).toEqual([
      { participantId: "a", amountFils: 15_000 },
      { participantId: "b", amountFils: 9_000 },
      { participantId: "c", amountFils: 6_000 },
    ]);
    expect(calculateExpenseSplits(30_000, {
      method: "SHARES",
      shares: [
        { participantId: "a", shares: 2 },
        { participantId: "b", shares: 2 },
        { participantId: "c", shares: 1 },
      ],
    })).toEqual([
      { participantId: "a", amountFils: 12_000 },
      { participantId: "b", amountFils: 12_000 },
      { participantId: "c", amountFils: 6_000 },
    ]);
  });
});

describe("calculateSettlement", () => {
  it("reduces multiple expenses into transfer instructions", () => {
    const result = calculateSettlement([
      {
        id: "dinner",
        payerId: "a",
        amountFils: 30_000,
        split: { method: "EQUAL", participantIds: ["a", "b", "c"] },
      },
      {
        id: "drinks",
        payerId: "b",
        amountFils: 6_000,
        split: { method: "EQUAL", participantIds: ["a", "b"] },
      },
    ]);

    expect(result.balances).toEqual({ a: 17_000, b: -7_000, c: -10_000 });
    expect(result.settlements).toEqual([
      { fromParticipantId: "c", toParticipantId: "a", amountFils: 10_000 },
      { fromParticipantId: "b", toParticipantId: "a", amountFils: 7_000 },
    ]);
    expect(formatAed(4_550)).toBe("AED 45.50");
  });
});
