// =====================================================================
// AERARIUM — lane action feasibility + consequences (pure, hook-free)
//
// THE single source of truth for "can this action happen, and what will it
// do?" Both lanes' ActionPanel runs every action through here BEFORE the wallet
// opens, so the submit button gates on real feasibility and the user sees the
// consequence of the action first. Structural by design: no checks scattered
// across components, no chain reads here — the caller passes the already-mapped
// {asset, position} (token-unit balances live on LaneAsset).
//
// Units: the amount field, Max, and every check below are TOKEN-denominated
// (asset.walletTokens / suppliedTokens / borrowedTokens). USD is derived only
// where a capacity / health comparison needs it, via asset.priceUsd (base ≈ $1).
// =====================================================================
import type { ActionType, LaneAsset, LanePosition } from "@/components/aerarium/lane/types";

export interface ActionInput {
  type: ActionType;
  /** Amount in the asset's OWN token units (what the user typed). */
  amountTokens: number;
  asset: LaneAsset;
  position: LanePosition;
}

export interface ValidationResult {
  ok: boolean;
  /** Plain-language reason shown near the submit button when !ok. */
  reason?: string;
  /** Non-blocking caution (e.g. a thin post-borrow health). ok stays true. */
  warning?: string;
}

export interface ConsequenceRow {
  label: string;
  value: string;
  /** Optional CSS color var for the value (e.g. "var(--pos)"). */
  tone?: string;
}

/** Whole-token USD price for the asset. Falls back to deriving from the USD/token
 *  wallet pair, then to $1 (the base). Never returns 0 (would zero out USD math). */
function priceOf(asset: LaneAsset): number {
  if (asset.priceUsd && asset.priceUsd > 0) return asset.priceUsd;
  if (asset.walletTokens > 0 && asset.walletBal > 0) return asset.walletBal / asset.walletTokens;
  return 1;
}

/** Collateral-capacity borrow headroom in USD: capacity − borrowed, floored at 0.
 *  This is ONE of the borrow constraints (see availableFor for the full min). */
function capacityHeadroomUsd(position: LanePosition): number {
  return Math.max(0, position.capacity - position.borrowed);
}

// =====================================================================
// availableFor — THE single source of truth for "how much can this action
// move?". Computes the min across EVERY applicable Compound v3 constraint for
// the action and reports which one BINDS. Max, the available label, and the
// feasibility gate all derive from this one function — no min-logic is
// duplicated in components or in validateAction/availableLabel. Structural by
// construction: add a constraint here and every consumer respects it.
// =====================================================================

/** Which constraint is the smallest (and therefore caps the action). "none"
 *  only when there is genuinely no positive ceiling (e.g. zero wallet). */
export type AvailableBinding =
  | "wallet"
  | "supplied"
  | "debt"
  | "capacity"
  | "liquidity"
  | "supplyCap"
  | "health"
  | "baseBorrowMin"
  // A held collateral's price feed is stale (OG-V2 getPrice reverts) so capacity
  // / health can't be valued. Borrow + collateral-withdraw-against-debt are
  // blocked with THIS reason (the on-chain isBorrowCollateralized would revert),
  // rather than a misleading "exceeds capacity" / "at risk". Supply, repay, and
  // no-debt collateral withdrawals don't need a price and are unaffected.
  | "priceStale"
  | "none";

export interface AvailableForInput {
  type: ActionType;
  asset: LaneAsset;
  position: LanePosition;
}

export interface AvailableResult {
  /** The available amount in the asset's OWN token units. */
  tokens: number;
  /** The same amount in USD (tokens × price). */
  usd: number;
  /** The constraint that bound the result — what the Max / label reflect. */
  binding: AvailableBinding;
}

/** A single named constraint expressed as a USD ceiling. Infinity = "this
 *  constraint doesn't apply / isn't known", so it never wins the min. */
interface Constraint {
  binding: AvailableBinding;
  usd: number;
}

/** Pick the smallest finite constraint; report its binding. When every
 *  constraint is non-binding (all Infinity) the available amount is 0 with
 *  binding "none". A constraint at exactly 0 still names its binding (e.g. a
 *  zero wallet binds "wallet"). */
function minConstraint(constraints: Constraint[]): { usd: number; binding: AvailableBinding } {
  let best: Constraint | null = null;
  for (const c of constraints) {
    if (!Number.isFinite(c.usd)) continue;
    if (best == null || c.usd < best.usd) best = c;
  }
  if (best == null) return { usd: 0, binding: "none" };
  return { usd: Math.max(0, best.usd), binding: best.binding };
}

/**
 * The available amount for an action = the min of ALL applicable constraints,
 * with the binding constraint named. Per action:
 *   - borrow:   min( capacity headroom, Comet available liquidity ) then floored
 *               to 0 if it can't reach baseBorrowMin.
 *   - supply:   min( wallet, collateral supply-cap headroom [best-effort] ).
 *   - withdraw: min( your supplied, [base] available liquidity,
 *               [collateral] max that keeps capacity ≥ debt [best-effort] ).
 *   - repay:    min( your debt, wallet ).
 * USD and token figures are kept in lockstep via the asset's price.
 */
/** Hitting the EXACT protocol boundary reverts on-chain: borrowing 100% of
 *  liquidity (utilization 100%), borrowing to exactly capacity (health = 1 →
 *  instantly liquidatable / a price-rounding revert), or filling a supply cap to
 *  the brim. A small haircut on THOSE bindings makes Max land safely under. Your
 *  OWN balance (wallet / supplied / debt) is never haircut — you can use 100%. */
const MAX_SAFETY_FACTOR = 0.999; // 0.1%
const PROTOCOL_BOUNDARY_BINDINGS: ReadonlySet<AvailableBinding> = new Set([
  "capacity",
  "liquidity",
  "health",
  "supplyCap",
]);
/** Truncate a positive token amount to `dp` (6 default) as a plain,
 *  separator-free string — for the Max button. Never rounds UP past the true
 *  amount (a hair over reverts on-chain — the operator's "trim the last digits"),
 *  and never inserts thousands separators (which break parseFloat / the input). */
export const floorTokens = (n: number, dp = 6): string => {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const f = 10 ** dp;
  return String(Math.floor(n * f) / f);
};

export function availableFor(input: AvailableForInput): AvailableResult {
  const { type, asset, position } = input;
  const price = priceOf(asset);
  const limits = position.limits;
  // Liquidity / min are USD figures; Infinity when not provided so they never
  // bind on fixtures that predate the limits seam (back-compat).
  const liquidityUsd = limits ? Math.max(0, limits.availableLiquidityUsd) : Infinity;
  const baseBorrowMinUsd = limits ? Math.max(0, limits.baseBorrowMinUsd) : 0;

  // Protocol-boundary bindings get a tiny safety haircut (Max can't land on the
  // exact on-chain edge); your own balance does not. Then truncate to the
  // display precision so the figure never rounds UP past what's borrowable.
  const toResult = (usd: number, binding: AvailableBinding): AvailableResult => {
    const safeUsd = PROTOCOL_BOUNDARY_BINDINGS.has(binding) ? usd * MAX_SAFETY_FACTOR : usd;
    return { usd: safeUsd, tokens: price > 0 ? safeUsd / price : 0, binding };
  };

  switch (type) {
    case "borrow": {
      // Borrow draws on the COMET's collateralization, which counts every
      // collateral with a live feed and TOLERATES a stale one (verified on-chain:
      // isBorrowCollateralized stays true, the borrow tx succeeds, with a stale
      // held collateral). So only block on the FEED when a stale feed is WHY
      // there's no priceable capacity (headroom 0). With any fresh collateral the
      // borrow succeeds — surface the conservative floor (stale collateral simply
      // uncounted; the true capacity is ≥ this).
      if (position.pricesStale && capacityHeadroomUsd(position) <= 0) {
        return toResult(0, "priceStale");
      }
      // Collateral capacity ∧ Comet liquidity. (Both are USD.)
      const { usd, binding } = minConstraint([
        { binding: "capacity", usd: capacityHeadroomUsd(position) },
        { binding: "liquidity", usd: liquidityUsd },
      ]);
      // baseBorrowMin: the resulting TOTAL debt must be ≥ the floor. If the
      // existing debt already clears it, the floor doesn't bind. Otherwise the
      // borrow must at least cover (min − existingDebt); if the available
      // amount can't reach that, nothing is borrowable.
      if (baseBorrowMinUsd > 0 && position.borrowed < baseBorrowMinUsd) {
        const needed = baseBorrowMinUsd - position.borrowed;
        if (usd < needed) return toResult(0, "baseBorrowMin");
      }
      return toResult(usd, binding);
    }

    case "supply": {
      // Wallet ∧ (collateral only) supply-cap headroom. The base has no cap;
      // a collateral with no headroom data falls back to wallet-only.
      const constraints: Constraint[] = [
        { binding: "wallet", usd: asset.walletTokens * price },
      ];
      if (asset.collateral && asset.supplyHeadroomTokens != null) {
        constraints.push({ binding: "supplyCap", usd: asset.supplyHeadroomTokens * price });
      }
      const { usd, binding } = minConstraint(constraints);
      return toResult(usd, binding);
    }

    case "withdraw": {
      const suppliedUsd = asset.suppliedTokens * price;
      const constraints: Constraint[] = [{ binding: "supplied", usd: suppliedUsd }];
      if (!asset.collateral) {
        // Base withdraw pulls from the same reserves a borrow draws on — you
        // can't withdraw base the Comet can't pay out.
        constraints.push({ binding: "liquidity", usd: liquidityUsd });
      } else {
        // Collateral withdraw lowers borrow capacity; the position must keep
        // capacity ≥ current debt. Withdrawing `w` USD of THIS collateral frees
        // capacity by `w × borrowCollateralFactor` (CF < 1), so the most you can
        // pull against the freed-capacity ceiling is (capacity − borrowed) / CF —
        // the EXACT protocol limit, not the raw headroom. (The MAX_SAFETY_FACTOR
        // haircut on the "health" binding still lands Max just under health = 1.)
        // The `supplied` constraint above co-bounds it, so you can never withdraw
        // more than you actually supplied. CF 0 (shouldn't happen for a real
        // collateral) falls back to the raw headroom rather than dividing by zero.
        //
        // With NO debt the position can't be at risk (Comet's
        // isBorrowCollateralized short-circuits to true at principal ≥ 0, reading
        // no price), so we add NO health constraint — a no-debt collateral
        // withdraw is always allowed up to the supplied balance, even if the
        // feed is stale.
        if (position.borrowed > 0) {
          if (asset.priceKnown === false || position.pricesStale) {
            // Debt + an unvaluable collateral → the on-chain check would revert
            // StalePriceFeed. Block on the FEED, not a fabricated "at risk".
            constraints.push({ binding: "priceStale", usd: 0 });
          } else {
            const headroomUsd = Math.max(0, position.capacity - position.borrowed);
            const cf = asset.borrowCollateralFactor;
            const freedCapacityCeilingUsd = cf > 0 ? headroomUsd / cf : headroomUsd;
            constraints.push({ binding: "health", usd: freedCapacityCeilingUsd });
          }
        }
      }
      const { usd, binding } = minConstraint(constraints);
      return toResult(usd, binding);
    }

    case "repay": {
      // Your debt ∧ wallet. Debt is the natural ceiling; the wallet caps what
      // you can actually pay.
      const { usd, binding } = minConstraint([
        { binding: "debt", usd: asset.borrowedTokens * price },
        { binding: "wallet", usd: asset.walletTokens * price },
      ]);
      return toResult(usd, binding);
    }

    default:
      return toResult(0, "none");
  }
}

/** Human phrase for a binding constraint when it's NOT the obvious one for the
 *  action — surfaced in availableLabel so the user understands why the ceiling
 *  is where it is (e.g. a borrow capped by liquidity below collateral capacity). */
function bindingHint(type: ActionType, binding: AvailableBinding): string | null {
  if (type === "borrow") {
    if (binding === "liquidity") return "limited by available liquidity";
    if (binding === "baseBorrowMin") return "below the protocol minimum";
  }
  if (type === "supply" && binding === "supplyCap") return "limited by the supply cap";
  if (type === "withdraw") {
    if (binding === "liquidity") return "limited by available liquidity";
    if (binding === "health") return "limited to keep your position healthy";
  }
  return null;
}

const fmtUsd = (n: number, dp = 2): string =>
  "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Trim a token amount for display — up to 6 dp, no trailing zeros. */
const fmtTok = (n: number): string => {
  if (!Number.isFinite(n)) return "0";
  const s = n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return s;
};

/**
 * The AVAILABLE amount for the current action, as a compact human label shown
 * near the amount field so the user isn't guessing what they can supply /
 * withdraw / repay / borrow. Driven entirely by availableFor (the single source
 * of truth) so the label, Max, and the feasibility gate can never disagree.
 * Token-denominated for the balance-bounded actions, USD for borrow (capacity /
 * liquidity are USD figures). When the binding constraint is NOT the obvious
 * one for the action — e.g. liquidity caps a borrow below the user's collateral
 * capacity — the label says so. Pure + hook-free.
 *
 *   supply   → "Available: {tokens} {sym} in wallet"  (+ cap hint)
 *   withdraw → "Available to withdraw: {tokens} {sym}" (+ liquidity/health hint)
 *   repay    → "Owed: {borrowedTokens} {sym}"          (+ wallet cap hint)
 *   borrow   → "Available to borrow: {fmt$(min(capacity, liquidity))}" (+ hint)
 */
export function availableLabel(type: ActionType, asset: LaneAsset, position: LanePosition): string {
  const avail = availableFor({ type, asset, position });
  const hint = bindingHint(type, avail.binding);
  const withHint = (s: string): string => (hint ? `${s} · ${hint}` : s);

  switch (type) {
    case "supply":
      return withHint(`Available: ${fmtTok(avail.tokens)} ${asset.sym} in wallet`);
    case "withdraw":
      return withHint(`Available to withdraw: ${fmtTok(avail.tokens)} ${asset.sym}`);
    case "repay": {
      const base = `Owed: ${fmtTok(asset.borrowedTokens)} ${asset.sym}`;
      // If the wallet can't cover the full debt, the wallet is the real cap —
      // surface it so the user knows the repay is bounded by what they hold.
      if (asset.walletTokens < asset.borrowedTokens) {
        return `${base} · ${fmtTok(asset.walletTokens)} ${asset.sym} in wallet`;
      }
      return base;
    }
    case "borrow":
      return withHint(`Available to borrow: ${fmtUsd(avail.usd)}`);
    default:
      return "";
  }
}

/** Plain-language rejection for an amount that exceeds the binding constraint.
 *  Keyed by which constraint bound the available amount, so the message matches
 *  the cap the user is actually hitting (not a generic "too much"). */
function reasonForBinding(binding: AvailableBinding): string {
  switch (binding) {
    case "wallet":
      return "Exceeds your wallet balance";
    case "supplied":
      return "Exceeds your supplied balance";
    case "debt":
      return "Exceeds your debt";
    case "capacity":
      return "Exceeds your borrow capacity";
    case "liquidity":
      return "Exceeds the available liquidity";
    case "supplyCap":
      return "Exceeds the supply cap";
    case "health":
      return "Would put your position below a safe health factor";
    case "baseBorrowMin":
      return "Below the protocol minimum borrow";
    case "priceStale":
      return "Price feed temporarily unavailable — try again shortly";
    case "none":
    default:
      return "Amount not available";
  }
}

/** Tolerance for the amount-vs-available comparison. The amount field is a
 *  user-typed decimal; the available figure is float-derived from raw reads, so
 *  a Max click that round-trips to the same value must not fail on a sub-ulp
 *  difference. Relative epsilon scaled to the magnitude. */
function exceeds(amountTokens: number, availableTokens: number): boolean {
  const eps = Math.max(1e-9, Math.abs(availableTokens) * 1e-9);
  return amountTokens > availableTokens + eps;
}

/**
 * Feasibility check for an action, in token units. Gates on availableFor — the
 * SINGLE source of truth — so the submit button can never disagree with the
 * Max button or the available label. Rejects an amount above the binding
 * constraint with a reason naming that constraint. A borrow that would leave a
 * thin health factor still passes with a non-blocking `warning`.
 */
export function validateAction(input: ActionInput): ValidationResult {
  const { type, amountTokens, asset, position } = input;

  // amount guard first — applies to every action.
  if (!Number.isFinite(amountTokens) || amountTokens <= 0) {
    return { ok: false, reason: "Enter an amount" };
  }

  const avail = availableFor({ type, asset, position });
  if (exceeds(amountTokens, avail.tokens)) {
    return { ok: false, reason: reasonForBinding(avail.binding) };
  }

  // Non-blocking thin-health caution on a feasible borrow. Health-after derives
  // from the current ratio when there's existing debt (see actionConsequences);
  // otherwise we can't price it precisely, so only warn when we can.
  if (type === "borrow") {
    const amountUsd = amountTokens * priceOf(asset);
    const after = healthAfterBorrow(position, amountUsd);
    if (after != null && after < 1.1) {
      return { ok: true, warning: "This would leave your position close to liquidation" };
    }
  }
  return { ok: true };
}

/**
 * Whether the user actually holds a position — ANY asset with a supplied or
 * borrowed TOKEN balance. Token-based, not USD: a stale price feed zeroes every
 * USD figure, so a USD-based check ("supplied > 0") wrongly reports "No position
 * yet" for a real position whose feeds are momentarily stale. Both lanes gate
 * the empty-state banner on this.
 */
export function hasHoldings(position: LanePosition): boolean {
  return position.assets.some((a) => a.suppliedTokens > 0 || a.borrowedTokens > 0);
}

/**
 * Health factor after borrowing `amountUsd` more, derived from the displayed
 * ratio. The shown healthFactor relates to borrowed via a liquidation threshold
 * T: healthFactor = T / borrowed ⇒ T = healthFactor × borrowed. After the new
 * draw: healthAfter = T / (borrowed + amountUsd). Returns null when there's no
 * existing debt (no T to derive — don't fabricate a precise number).
 */
function healthAfterBorrow(position: LanePosition, amountUsd: number): number | null {
  if (position.borrowed > 0 && Number.isFinite(position.healthFactor)) {
    const T = position.healthFactor * position.borrowed;
    const newBorrowed = position.borrowed + amountUsd;
    if (newBorrowed > 0) return T / newBorrowed;
  }
  return null;
}

/** Health after repaying `amountUsd` — same T, smaller denominator. Returns null
 *  when no debt remains afterwards (no-debt is shown as the sentinel by the UI). */
function healthAfterRepay(position: LanePosition, amountUsd: number): number | null {
  if (position.borrowed > 0 && Number.isFinite(position.healthFactor)) {
    const T = position.healthFactor * position.borrowed;
    const newBorrowed = position.borrowed - amountUsd;
    if (newBorrowed > 0) return T / newBorrowed;
  }
  return null;
}

/**
 * The result rows the user sees BEFORE signing — the consequence of the action.
 * Honest by construction: health-after is shown with "≈" and only when it can be
 * derived from the position ratio; otherwise we show a capacity figure + a
 * direction rather than a fabricated precise number.
 */
export function actionConsequences(input: ActionInput): ConsequenceRow[] {
  const { type, amountTokens, asset, position } = input;
  const amt = Number.isFinite(amountTokens) && amountTokens > 0 ? amountTokens : 0;
  const price = priceOf(asset);
  const amountUsd = amt * price;
  const rows: ConsequenceRow[] = [];

  if (type === "supply") {
    rows.push({ label: "Supply APY", value: (asset.supplyApy || 0).toFixed(2) + "%", tone: "var(--pos)" });
    const earnYr = amountUsd * ((asset.supplyApy || 0) / 100);
    rows.push({
      label: "Projected earnings",
      value: "~" + fmtUsd(earnYr) + "/yr",
      tone: "var(--gold-bright)",
    });
    return rows;
  }

  if (type === "borrow") {
    const after = position.borrowed + amountUsd;
    rows.push({
      label: "Borrow capacity used",
      value: fmtUsd(after, 0) + " / " + fmtUsd(position.capacity, 0),
    });
    // If the borrow is bound by something OTHER than the user's collateral
    // capacity (e.g. the Comet's available liquidity), surface that limit so
    // the consequence is honest about why the ceiling is where it is.
    const avail = availableFor({ type, asset, position });
    if (avail.binding === "liquidity") {
      rows.push({
        label: "Limited by liquidity",
        value: fmtUsd(avail.usd, 0) + " available",
        tone: "var(--marble-2)",
      });
    }
    const healthAfter = healthAfterBorrow(position, amountUsd);
    if (healthAfter != null) {
      rows.push({
        label: "Health after",
        value: "≈ " + healthAfter.toFixed(2),
        tone: healthAfter < 1.25 ? "var(--oxblood-br)" : "var(--gold-bright)",
      });
    } else {
      // No existing debt → can't derive a precise number; state the direction.
      rows.push({ label: "Health after", value: "≈ healthy, decreases", tone: "var(--gold-bright)" });
    }
    rows.push({ label: "Borrow APY", value: (asset.borrowApy || 0).toFixed(2) + "%" });
    return rows;
  }

  if (type === "withdraw") {
    const remaining = Math.max(0, asset.suppliedTokens - amt);
    rows.push({
      label: "Remaining supplied",
      value: fmtTok(remaining) + " " + asset.sym,
    });
    // Withdrawing collateral lowers capacity; with debt outstanding, health
    // direction is down. We don't have the per-asset collateral factor here, so
    // we state the direction honestly rather than invent a number.
    if (position.borrowed > 0) {
      rows.push({ label: "Health after", value: "≈ decreases", tone: "var(--gold-bright)" });
    }
    return rows;
  }

  if (type === "repay") {
    const remainingDebt = Math.max(0, asset.borrowedTokens - amt);
    rows.push({
      label: "Remaining debt",
      value: fmtTok(remainingDebt) + " " + asset.sym,
      tone: "var(--pos)",
    });
    const healthAfter = healthAfterRepay(position, amountUsd);
    if (healthAfter != null) {
      rows.push({ label: "Health after", value: "≈ " + healthAfter.toFixed(2), tone: "var(--pos)" });
    } else if (position.borrowed > 0) {
      // Repaying the remainder clears the debt.
      rows.push({ label: "Health after", value: "≈ no debt", tone: "var(--pos)" });
    }
    return rows;
  }

  return rows;
}
