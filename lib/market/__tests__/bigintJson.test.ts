import { describe, it, expect } from "vitest";
import { serializeBigints, reviveBigints } from "../bigintJson";

describe("bigintJson codec", () => {
  it("round-trips bigints exactly (nested), with no precision loss", () => {
    const big = 123456789012345678901234567890n; // > 2^53, Number() would lose it
    const obj = { a: big, b: { c: [1n, 2n], d: "x" }, n: 5, s: "hi", bool: true, nil: null };
    const round = reviveBigints<typeof obj>(serializeBigints(obj));
    expect(round.a).toBe(big);
    expect(typeof round.a).toBe("bigint");
    expect(round.b.c).toEqual([1n, 2n]);
    expect(round.n).toBe(5);
    expect(round.s).toBe("hi");
    expect(round.bool).toBe(true);
    expect(round.nil).toBeNull();
  });

  it("serializeBigints does NOT throw on bigints (raw JSON.stringify would)", () => {
    expect(() => serializeBigints({ x: 1n })).not.toThrow();
    expect(() => JSON.stringify({ x: 1n })).toThrow();
  });

  it("plain JSON (no bigints) round-trips unchanged", () => {
    const obj = { a: 1, b: "two", c: [true, null], d: { e: 3 } };
    expect(reviveBigints(serializeBigints(obj))).toEqual(obj);
  });
});
