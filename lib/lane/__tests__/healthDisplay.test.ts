import { describe, it, expect } from "vitest";
import { resolveHealthDisplay } from "../healthDisplay";

describe("resolveHealthDisplay — one shared rule for both health widgets", () => {
  it("no position → show nothing", () => {
    const d = resolveHealthDisplay({ borrowed: 0, pricesStale: false }, /*empty*/ true);
    expect(d.showHealth).toBe(false);
    expect(d.showCapacity).toBe(false);
  });

  it("fresh prices → show health AND capacity", () => {
    const d = resolveHealthDisplay({ borrowed: 0, pricesStale: false }, false);
    expect(d.showHealth).toBe(true);
    expect(d.showCapacity).toBe(true);
    expect(d.stale).toBe(false);
  });

  it("stale prices but NO debt → show health (can't be liquidated) AND the capacity floor", () => {
    // The operator's recurring case: an exotic collateral feed is stale, but with
    // $0 borrowed the position is trivially safe. Show health; also show capacity
    // (availableFor returns the conservative floor from the priceable collateral —
    // the borrow against fresh collateral succeeds on-chain), with a stale caveat.
    const d = resolveHealthDisplay({ borrowed: 0, pricesStale: true }, false);
    expect(d.showHealth).toBe(true);
    expect(d.showCapacity).toBe(true);
    expect(d.stale).toBe(true);
  });

  it("stale prices WITH debt → hide health (genuinely unknown) but STILL show the capacity floor", () => {
    const d = resolveHealthDisplay({ borrowed: 1200, pricesStale: true }, false);
    expect(d.showHealth).toBe(false);
    expect(d.showCapacity).toBe(true);
    expect(d.stale).toBe(true);
  });

  it("fresh prices WITH debt → show both", () => {
    const d = resolveHealthDisplay({ borrowed: 1200, pricesStale: false }, false);
    expect(d.showHealth).toBe(true);
    expect(d.showCapacity).toBe(true);
  });

  it("treats undefined pricesStale as fresh", () => {
    const d = resolveHealthDisplay({ borrowed: 0 }, false);
    expect(d.showHealth).toBe(true);
    expect(d.showCapacity).toBe(true);
    expect(d.stale).toBe(false);
  });
});
