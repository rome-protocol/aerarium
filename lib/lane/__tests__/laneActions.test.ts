import { describe, it, expect } from "vitest";
import { validateAction, actionConsequences, availableLabel, availableFor, hasHoldings } from "../laneActions";
import type { LaneAsset, LanePosition } from "@/components/aerarium/lane/types";

// ---- fixtures -------------------------------------------------------------
// Base wUSDC ≈ $1 (tokens == USD). wETH collateral at $3000 (tokens ≠ USD).
function baseAsset(over: Partial<LaneAsset> = {}): LaneAsset {
  return {
    sym: "wUSDC",
    name: "USD Coin",
    supplyApy: 5.18,
    borrowApy: 7.62,
    borrowable: true,
    walletBal: 900,
    suppliedBal: 0,
    borrowedBal: 0,
    walletTokens: 900,
    suppliedTokens: 0,
    borrowedTokens: 0,
    priceUsd: 1,
    collateral: false,
    // Base / non-collateral assets contribute no borrow capacity (CF 0).
    borrowCollateralFactor: 0,
    decimals: 6,
    ...over,
  };
}

function collatAsset(over: Partial<LaneAsset> = {}): LaneAsset {
  return {
    sym: "wETH",
    name: "Wrapped Ether",
    supplyApy: 2.41,
    borrowApy: 0,
    borrowable: false,
    walletBal: 6000, // 2 wETH × $3000
    suppliedBal: 0,
    borrowedBal: 0,
    walletTokens: 2, // <-- 2 tokens, not 6000
    suppliedTokens: 0,
    borrowedTokens: 0,
    priceUsd: 3000,
    collateral: true,
    // wETH borrow collateral factor 0.8 (Comet 1e18-scaled → 0.8 here).
    borrowCollateralFactor: 0.8,
    decimals: 8,
    ...over,
  };
}

function position(over: Partial<LanePosition> = {}): LanePosition {
  return {
    supplied: 6000,
    borrowed: 1200,
    capacity: 4800,
    healthFactor: 4.25,
    netApr: 1.2,
    assets: [],
    ...over,
  };
}

// ---- validateAction -------------------------------------------------------
describe("validateAction — amount guards", () => {
  it("rejects zero / empty / NaN with 'Enter an amount'", () => {
    const a = baseAsset();
    const p = position();
    expect(validateAction({ type: "supply", amountTokens: 0, asset: a, position: p })).toEqual({
      ok: false,
      reason: "Enter an amount",
    });
    expect(validateAction({ type: "supply", amountTokens: NaN, asset: a, position: p }).ok).toBe(false);
    expect(validateAction({ type: "supply", amountTokens: -5, asset: a, position: p }).reason).toBe(
      "Enter an amount",
    );
  });
});

describe("validateAction — supply", () => {
  it("passes when amount ≤ wallet token balance", () => {
    expect(
      validateAction({ type: "supply", amountTokens: 1.5, asset: collatAsset(), position: position() }),
    ).toEqual({ ok: true });
  });
  it("fails over wallet balance — in TOKEN units, not USD (collateral price ≠ $1)", () => {
    // 3 wETH > 2 wETH wallet → fail, even though 3 < the $6000 USD wallet number.
    const r = validateAction({ type: "supply", amountTokens: 3, asset: collatAsset(), position: position() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("Exceeds your wallet balance");
  });
});

describe("validateAction — withdraw", () => {
  it("fails over supplied token balance (no debt → supplied is the binding cap)", () => {
    // no debt, so the collateral-health constraint doesn't bind — the ceiling
    // is the user's supplied balance.
    const a = collatAsset({ suppliedTokens: 2, walletTokens: 0 });
    const p = position({ borrowed: 0, capacity: 4800 });
    const r = validateAction({ type: "withdraw", amountTokens: 2.5, asset: a, position: p });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("Exceeds your supplied balance");
  });
  it("passes within supplied balance (no debt)", () => {
    const a = collatAsset({ suppliedTokens: 2, walletTokens: 0 });
    const p = position({ borrowed: 0, capacity: 4800 });
    expect(validateAction({ type: "withdraw", amountTokens: 1, asset: a, position: p })).toEqual({
      ok: true,
    });
  });
});

describe("validateAction — repay", () => {
  it("fails over debt with 'Exceeds your debt'", () => {
    const a = baseAsset({ borrowedTokens: 1200, walletTokens: 5000 });
    const r = validateAction({ type: "repay", amountTokens: 1500, asset: a, position: position() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("Exceeds your debt");
  });
  it("fails over wallet (can't afford the repay) even when within debt", () => {
    const a = baseAsset({ borrowedTokens: 1200, walletTokens: 300 });
    const r = validateAction({ type: "repay", amountTokens: 500, asset: a, position: position() });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("Exceeds your wallet balance");
  });
  it("passes within both debt and wallet", () => {
    const a = baseAsset({ borrowedTokens: 1200, walletTokens: 5000 });
    expect(validateAction({ type: "repay", amountTokens: 500, asset: a, position: position() })).toEqual({
      ok: true,
    });
  });
});

describe("validateAction — borrow", () => {
  it("fails over remaining capacity (amountUsd = tokens × price)", () => {
    // capacity 4800, borrowed 1200 → available 3600 USD. Base price $1 so 3601 tokens > 3600 USD.
    const p = position({ capacity: 4800, borrowed: 1200 });
    const r = validateAction({ type: "borrow", amountTokens: 3601, asset: baseAsset(), position: p });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("Exceeds your borrow capacity");
  });
  it("passes within remaining capacity", () => {
    const p = position({ capacity: 4800, borrowed: 1200 });
    expect(validateAction({ type: "borrow", amountTokens: 1000, asset: baseAsset(), position: p }).ok).toBe(
      true,
    );
  });
});

// ---- actionConsequences ---------------------------------------------------
describe("actionConsequences", () => {
  it("supply → shows the supply APY and a projected-earnings row", () => {
    const rows = actionConsequences({
      type: "supply",
      amountTokens: 1000,
      asset: baseAsset(),
      position: position(),
    });
    const labels = rows.map((r) => r.label);
    expect(labels.some((l) => /supply apy/i.test(l))).toBe(true);
    expect(labels.some((l) => /earn/i.test(l))).toBe(true);
    // 1000 × $1 × 5.18% ≈ $51.80/yr — value mentions the number
    expect(rows.find((r) => /earn/i.test(r.label))?.value).toMatch(/51\.8/);
  });

  it("borrow → capacity-used (after/cap) + health-after ≈ + borrow APY", () => {
    const p = position({ capacity: 4800, borrowed: 1200, healthFactor: 4.25 });
    const rows = actionConsequences({
      type: "borrow",
      amountTokens: 1200,
      asset: baseAsset(),
      position: p,
    });
    const cap = rows.find((r) => /capacity used/i.test(r.label));
    // borrowed 1200 + 1200 = 2400 over 4800
    expect(cap?.value).toMatch(/2,?400/);
    expect(cap?.value).toMatch(/4,?800/);
    // health after derived from ratio: 4.25 × 1200 / 2400 ≈ 2.13, shown with ≈
    const health = rows.find((r) => /health/i.test(r.label));
    expect(health?.value).toMatch(/≈/);
    expect(health?.value).toMatch(/2\.1/);
  });

  it("withdraw → remaining supplied + a health direction", () => {
    const a = collatAsset({ suppliedTokens: 2, suppliedBal: 6000 });
    const rows = actionConsequences({
      type: "withdraw",
      amountTokens: 1,
      asset: a,
      position: position({ borrowed: 1200 }),
    });
    expect(rows.some((r) => /remaining supplied/i.test(r.label))).toBe(true);
    // 1 of 2 wETH withdrawn → 1 wETH remaining
    expect(rows.find((r) => /remaining supplied/i.test(r.label))?.value).toMatch(/1\b/);
  });

  it("repay → remaining debt", () => {
    const a = baseAsset({ borrowedTokens: 1200, borrowedBal: 1200, walletTokens: 5000 });
    const rows = actionConsequences({
      type: "repay",
      amountTokens: 500,
      asset: a,
      position: position({ borrowed: 1200 }),
    });
    const rem = rows.find((r) => /remaining debt/i.test(r.label));
    expect(rem).toBeTruthy();
    // 1200 − 500 = 700 left
    expect(rem?.value).toMatch(/700/);
  });
});

// ---- availableLabel -------------------------------------------------------
describe("availableLabel", () => {
  it("supply → wallet token balance (token units, NOT USD) + symbol", () => {
    // collateral: 2 wETH wallet, $6000 USD — the label shows the 2 tokens.
    const label = availableLabel("supply", collatAsset({ walletTokens: 2, walletBal: 6000 }), position());
    expect(label).toBe("Available: 2 wETH in wallet");
    // must use the token count, never the USD number.
    expect(label).not.toMatch(/6,?000/);
  });

  it("withdraw → available-to-withdraw token balance + symbol (no debt → bound by supplied)", () => {
    // no debt → the collateral-health constraint doesn't bind, so the available
    // withdrawal equals the supplied balance.
    const label = availableLabel("withdraw", collatAsset({ suppliedTokens: 1.5 }), position({ borrowed: 0 }));
    expect(label).toBe("Available to withdraw: 1.5 wETH");
  });

  it("repay → owed (debt) in token units + symbol", () => {
    const label = availableLabel("repay", baseAsset({ borrowedTokens: 1200, walletTokens: 5000 }), position());
    expect(label).toBe("Owed: 1,200 wUSDC");
  });

  it("repay → hints the wallet cap when the wallet can't cover the full debt", () => {
    const label = availableLabel("repay", baseAsset({ borrowedTokens: 1200, walletTokens: 300 }), position());
    expect(label).toMatch(/Owed: 1,200 wUSDC/);
    // wallet (300) < owed (1200) → surface the wallet cap.
    expect(label).toMatch(/300 wUSDC in wallet/);
  });

  it("borrow → remaining capacity in USD (capacity − borrowed)", () => {
    // capacity 4800, borrowed 1200 → $3,600.00 available.
    const label = availableLabel("borrow", baseAsset(), position({ capacity: 4800, borrowed: 1200 }));
    expect(label).toBe("Available to borrow: $3,596.40");
  });

  it("borrow → floors at $0.00 when over capacity (never negative)", () => {
    const label = availableLabel("borrow", baseAsset(), position({ capacity: 1000, borrowed: 1500 }));
    expect(label).toBe("Available to borrow: $0.00");
  });

  it("borrow → notes the binding limit when liquidity caps below collateral capacity", () => {
    // capacity 4800, borrowed 1200 → 3600 capacity-headroom; but only $500 of
    // base liquidity is available → liquidity binds the borrow.
    const p = position({
      capacity: 4800,
      borrowed: 1200,
      limits: { availableLiquidityUsd: 500, baseBorrowMinUsd: 0 },
    });
    const label = availableLabel("borrow", baseAsset(), p);
    expect(label).toMatch(/\$499\.50/);
    expect(label).toMatch(/liquidity/i);
  });
});

// ---- availableFor (single source of truth: min of all constraints) --------
describe("availableFor — borrow", () => {
  it("capped by collateral capacity when capacity < liquidity (binding: capacity)", () => {
    const p = position({
      capacity: 4800,
      borrowed: 1200, // headroom 3600
      limits: { availableLiquidityUsd: 100_000, baseBorrowMinUsd: 0 },
    });
    const r = availableFor({ type: "borrow", asset: baseAsset(), position: p });
    expect(r.usd).toBeCloseTo(3596.4, 4);
    expect(r.tokens).toBeCloseTo(3596.4, 4); // base $1
    expect(r.binding).toBe("capacity");
  });

  it("capped by available liquidity when liquidity < capacity (binding: liquidity)", () => {
    const p = position({
      capacity: 4800,
      borrowed: 1200, // headroom 3600
      limits: { availableLiquidityUsd: 500, baseBorrowMinUsd: 0 },
    });
    const r = availableFor({ type: "borrow", asset: baseAsset(), position: p });
    expect(r.usd).toBeCloseTo(499.5, 4);
    expect(r.tokens).toBeCloseTo(499.5, 4);
    expect(r.binding).toBe("liquidity");
  });

  it("min picks the smaller of capacity and liquidity", () => {
    const p = position({
      capacity: 2000,
      borrowed: 0, // headroom 2000
      limits: { availableLiquidityUsd: 750, baseBorrowMinUsd: 0 },
    });
    expect(availableFor({ type: "borrow", asset: baseAsset(), position: p }).usd).toBeCloseTo(749.25, 4);
  });

  it("returns 0 available when the result would fall below baseBorrowMin", () => {
    // headroom 3600, liquidity huge, but baseBorrowMin 5000 with no existing
    // debt → a borrow can't reach the floor, so nothing is borrowable.
    const p = position({
      capacity: 4800,
      borrowed: 0,
      limits: { availableLiquidityUsd: 100_000, baseBorrowMinUsd: 5000 },
    });
    const r = availableFor({ type: "borrow", asset: baseAsset(), position: p });
    expect(r.usd).toBe(0);
    expect(r.binding).toBe("baseBorrowMin");
  });

  it("baseBorrowMin already satisfied by existing debt → no extra floor", () => {
    // existing debt 1200 ≥ min 1000, so the min doesn't bind; capacity headroom does.
    const p = position({
      capacity: 4800,
      borrowed: 1200,
      limits: { availableLiquidityUsd: 100_000, baseBorrowMinUsd: 1000 },
    });
    const r = availableFor({ type: "borrow", asset: baseAsset(), position: p });
    expect(r.usd).toBeCloseTo(3596.4, 4);
    expect(r.binding).toBe("capacity");
  });

  it("falls back to capacity-only when no limits present (back-compat)", () => {
    const p = position({ capacity: 4800, borrowed: 1200 }); // no limits
    const r = availableFor({ type: "borrow", asset: baseAsset(), position: p });
    expect(r.usd).toBeCloseTo(3596.4, 4);
    expect(r.binding).toBe("capacity");
  });
});

describe("availableFor — supply", () => {
  it("capped by wallet balance (binding: wallet)", () => {
    const a = collatAsset({ walletTokens: 2 }); // 2 wETH
    const r = availableFor({ type: "supply", asset: a, position: position() });
    expect(r.tokens).toBeCloseTo(2, 6);
    expect(r.binding).toBe("wallet");
  });

  it("capped by supply-cap headroom when headroom < wallet (binding: supplyCap)", () => {
    const a = collatAsset({ walletTokens: 5, supplyHeadroomTokens: 1.5 });
    const r = availableFor({ type: "supply", asset: a, position: position() });
    expect(r.tokens).toBeCloseTo(1.4985, 6); // 1.5 × 0.999 safety haircut (protocol cap)
    expect(r.binding).toBe("supplyCap");
  });

  it("base asset ignores supply cap (no cap) — bound by wallet", () => {
    const a = baseAsset({ walletTokens: 900 }); // base, no headroom field
    const r = availableFor({ type: "supply", asset: a, position: position() });
    expect(r.tokens).toBeCloseTo(900, 4);
    expect(r.binding).toBe("wallet");
  });
});

describe("availableFor — withdraw", () => {
  it("base withdraw capped by available liquidity when liquidity < supplied (binding: liquidity)", () => {
    // supplied 1000 base tokens, but only $300 liquidity available to pay out.
    const a = baseAsset({ suppliedTokens: 1000, priceUsd: 1 });
    const p = position({ limits: { availableLiquidityUsd: 300, baseBorrowMinUsd: 0 } });
    const r = availableFor({ type: "withdraw", asset: a, position: p });
    expect(r.tokens).toBeCloseTo(299.7, 4); // 300 × 0.999 safety haircut (protocol liquidity)
    expect(r.binding).toBe("liquidity");
  });

  it("base withdraw bound by supplied when supplied < liquidity (binding: supplied)", () => {
    const a = baseAsset({ suppliedTokens: 200, priceUsd: 1 });
    const p = position({ limits: { availableLiquidityUsd: 100_000, baseBorrowMinUsd: 0 } });
    const r = availableFor({ type: "withdraw", asset: a, position: p });
    expect(r.tokens).toBeCloseTo(200, 4);
    expect(r.binding).toBe("supplied");
  });

  it("collateral withdraw bound by supplied when no debt (health doesn't bind)", () => {
    const a = collatAsset({ suppliedTokens: 2 });
    const p = position({ borrowed: 0, capacity: 4800 });
    const r = availableFor({ type: "withdraw", asset: a, position: p });
    expect(r.tokens).toBeCloseTo(2, 6);
    expect(r.binding).toBe("supplied");
  });

  it("collateral withdraw capped by health when withdrawing all would drop capacity below debt (binding: health)", () => {
    // 2 wETH supplied (@ $3000, borrowCF implied via capacity), capacity 4800,
    // debt 1200. Removing collateral cuts capacity proportionally; the max
    // withdrawal must keep capacity ≥ debt. The slack is (capacity − debt) in
    // capacity-USD = 3600; per wETH the capacity contribution = 4800/2 = 2400,
    // so withdrawable collateral USD = 3600/0.8 factor implied = ... we assert
    // the binding + that it's < the full supplied (2 tokens).
    const a = collatAsset({ suppliedTokens: 2, suppliedBal: 6000, priceUsd: 3000 });
    const p = position({ borrowed: 4200, capacity: 4800, supplied: 6000 });
    const r = availableFor({ type: "withdraw", asset: a, position: p });
    expect(r.binding).toBe("health");
    expect(r.tokens).toBeLessThan(2);
    expect(r.tokens).toBeGreaterThan(0);
  });

  // EXACT-max: withdrawing w USD of a collateral frees capacity = w × CF (CF<1),
  // so the true max withdrawable against the freed-capacity ceiling is
  // (capacity − borrowed) / CF, NOT (capacity − borrowed). The health binding
  // keeps the existing 0.999 protocol-boundary haircut. (RED before the fix:
  // returns slack × 0.999 instead of slack / CF × 0.999.)
  it("health-bound collateral withdraw frees capacity at the borrow CF: max = (capacity − borrowed) / CF (× 0.999)", () => {
    // slack = capacity − borrowed = 4800 − 4000 = 800 USD; CF 0.8; supplied
    // ($6000) far exceeds slack/CF ($1000) so the HEALTH ceiling binds, not supplied.
    const a = collatAsset({ borrowCollateralFactor: 0.8, suppliedTokens: 2, suppliedBal: 6000, priceUsd: 3000 });
    const p = position({ borrowed: 4000, capacity: 4800, supplied: 6000 });
    const r = availableFor({ type: "withdraw", asset: a, position: p });
    expect(r.binding).toBe("health");
    // (800 / 0.8) × 0.999 = 1000 × 0.999 = 999 USD  (NOT 800 × 0.999 = 799.2)
    expect(r.usd).toBeCloseTo(999, 6);
    expect(r.tokens).toBeCloseTo(999 / 3000, 8);
  });

  // No-stepping invariant: ONE Max withdraw must (essentially) exhaust the
  // freed-capacity headroom. After withdrawing the returned max (capacity drops
  // by withdrawn×CF, borrowed unchanged), the recomputed max must be a negligible
  // fraction of the first — i.e. the UI does NOT step down geometrically toward
  // slack/CF. RED before the fix: the first Max only consumes slack×CF of
  // capacity, leaving ~slack×(1−CF) → the second Max is ~(1−CF)=20% of the first.
  it("no stepping: a single Max withdraw exhausts the freed-capacity headroom (next Max ≈ 0)", () => {
    const cf = 0.8;
    const price = 3000;
    const capacity = 4800;
    const borrowed = 4000; // slack 800
    const a = collatAsset({ borrowCollateralFactor: cf, suppliedTokens: 2, suppliedBal: 6000, priceUsd: price });
    const p = position({ borrowed, capacity, supplied: 6000 });

    const first = availableFor({ type: "withdraw", asset: a, position: p });
    expect(first.binding).toBe("health");

    // Apply the first Max: capacity falls by (withdrawn USD × CF); borrowed unchanged.
    const capacityAfter = capacity - first.usd * cf;
    const second = availableFor({
      type: "withdraw",
      asset: { ...a, suppliedTokens: 2 - first.tokens, suppliedBal: a.suppliedBal - first.usd },
      position: { ...p, capacity: capacityAfter },
    });
    // The leftover is only the 0.999 haircut residual, NOT slack×(1−CF). Under the
    // OLD (buggy) code this ratio is ≈ (1−CF) = 0.2; the fix drives it to ~1e-3.
    expect(second.usd / first.usd).toBeLessThan(0.01);
  });
});

describe("availableFor — repay", () => {
  it("capped by debt when debt < wallet (binding: debt)", () => {
    const a = baseAsset({ borrowedTokens: 1200, walletTokens: 5000 });
    const r = availableFor({ type: "repay", asset: a, position: position() });
    expect(r.tokens).toBeCloseTo(1200, 4);
    expect(r.binding).toBe("debt");
  });

  it("capped by wallet when wallet < debt (binding: wallet)", () => {
    const a = baseAsset({ borrowedTokens: 1200, walletTokens: 300 });
    const r = availableFor({ type: "repay", asset: a, position: position() });
    expect(r.tokens).toBeCloseTo(300, 4);
    expect(r.binding).toBe("wallet");
  });
});

// A held collateral's OG-V2 feed reverts StalePriceFeed → priceUSDx8 0 →
// pricesStale. The gates must name the real reason (the feed), not fabricate
// "at risk" / "exceeds capacity", and must NOT block a no-debt collateral
// withdrawal (Comet's isBorrowCollateralized short-circuits at principal>=0,
// reading no price).
describe("availableFor / validateAction — stale price feed", () => {
  it("allows a FULL no-debt collateral withdraw even when its price is unknown", () => {
    const a = collatAsset({ suppliedTokens: 1.001, suppliedBal: 0, walletBal: 0, priceUsd: 0, priceKnown: false });
    const p = position({ borrowed: 0, capacity: 0, pricesStale: true });
    const r = availableFor({ type: "withdraw", asset: a, position: p });
    expect(r.binding).toBe("supplied");
    expect(r.tokens).toBeCloseTo(1.001, 6);
    expect(validateAction({ type: "withdraw", amountTokens: 0.2, asset: a, position: p }).ok).toBe(true);
  });

  it("blocks a WITH-debt collateral withdraw as 'price feed', not 'at risk', when the feed is stale", () => {
    const a = collatAsset({ suppliedTokens: 1.001, suppliedBal: 0, walletBal: 0, priceUsd: 0, priceKnown: false });
    const p = position({ borrowed: 50, capacity: 0, pricesStale: true });
    const r = availableFor({ type: "withdraw", asset: a, position: p });
    expect(r.binding).toBe("priceStale");
    expect(r.tokens).toBe(0);
    const v = validateAction({ type: "withdraw", amountTokens: 0.2, asset: a, position: p });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/price feed/i);
  });

  it("blocks borrow as 'price feed' ONLY when a stale feed leaves NO priceable capacity (headroom 0)", () => {
    const a = baseAsset({ walletTokens: 0 });
    const p = position({ borrowed: 0, capacity: 0, pricesStale: true, limits: { availableLiquidityUsd: 5000, baseBorrowMinUsd: 1 } });
    const r = availableFor({ type: "borrow", asset: a, position: p });
    expect(r.binding).toBe("priceStale");
    expect(r.tokens).toBe(0);
  });

  it("shows the FRESH-collateral capacity floor for borrow even when SOME held collateral is stale", () => {
    // Operator's live case: fresh wETH+wBTC give real capacity; a stale wBONK
    // position sets pricesStale, but the on-chain borrow SUCCEEDS against the
    // fresh collateral (isBorrowCollateralized stays true). So don't short-circuit
    // to $0 — surface the conservative floor (stale collateral simply uncounted).
    const a = baseAsset({ walletTokens: 0 });
    const p = position({ borrowed: 0, capacity: 600, pricesStale: true, limits: { availableLiquidityUsd: 5000, baseBorrowMinUsd: 1 } });
    const r = availableFor({ type: "borrow", asset: a, position: p });
    expect(r.usd).toBeCloseTo(599.4, 4); // the fresh-collateral floor (× 0.999 haircut), NOT 0
    expect(r.binding).not.toBe("priceStale");
  });

  it("leaves supply unaffected by a stale feed (no price needed to deposit)", () => {
    const a = collatAsset({ walletTokens: 2, walletBal: 0, priceUsd: 0, priceKnown: false });
    const p = position({ pricesStale: true });
    const r = availableFor({ type: "supply", asset: a, position: p });
    expect(r.binding).toBe("wallet");
    expect(r.tokens).toBeCloseTo(2, 6);
  });
});

describe("hasHoldings — token-based position check (survives stale prices)", () => {
  it("true when a collateral has supplied TOKENS even though its USD is $0 (stale feed)", () => {
    const p = position({
      supplied: 0, // USD totals zeroed by the stale feed…
      borrowed: 0,
      assets: [collatAsset({ suppliedTokens: 1.91, suppliedBal: 0, priceUsd: 0, priceKnown: false })],
    });
    expect(hasHoldings(p)).toBe(true); // …but the position is real
  });

  it("true when the base has supplied tokens", () => {
    const p = position({ supplied: 0, borrowed: 0, assets: [baseAsset({ suppliedTokens: 12 })] });
    expect(hasHoldings(p)).toBe(true);
  });

  it("false when nothing is supplied or borrowed (wallet-only)", () => {
    const p = position({ supplied: 0, borrowed: 0, assets: [collatAsset({ suppliedTokens: 0, borrowedTokens: 0, walletTokens: 5 })] });
    expect(hasHoldings(p)).toBe(false);
  });
});
