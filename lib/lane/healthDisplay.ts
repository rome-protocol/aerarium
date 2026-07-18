// Single source of truth for how BOTH health widgets (the Manage tab's
// HealthCapacity and the dashboard's PositionSummary) gate their display under a
// stale price feed. Keeping the rule here — not duplicated in each component —
// is what makes the two surfaces agree by construction.
//
// The rule:
//   - Health factor is UNKNOWN only when prices are stale AND there's debt to
//     value collateral against. With $0 borrowed you cannot be liquidated, so
//     health is trivially safe regardless of price freshness — show it. (The
//     old Manage tab over-blanked: it hid health on ANY stale feed even with no
//     debt, while the dashboard always showed it — the inconsistency this fixes.)
//   - Borrow capacity / available-to-borrow ALWAYS need live collateral prices,
//     so they're shown only when prices are fresh.

export interface HealthDisplayInput {
  /** USD debt. > 0 means the position has borrowings to be valued against. */
  borrowed: number;
  /** A held collateral's price feed is stale (getPrice reverts StalePriceFeed). */
  pricesStale?: boolean;
}

export interface HealthDisplay {
  /** Render the health factor number + risk band (else dash + "prices updating"). */
  showHealth: boolean;
  /** Render borrow-capacity figures (available-to-borrow, capacity used / bar). */
  showCapacity: boolean;
  /** Prices are stale — drives the "prices updating" caveat copy. */
  stale: boolean;
}

export function resolveHealthDisplay(input: HealthDisplayInput, empty: boolean): HealthDisplay {
  const stale = input.pricesStale === true;
  const hasDebt = input.borrowed > 0;
  return {
    showHealth: !empty && !(stale && hasDebt),
    // Borrow capacity / available-to-borrow is shown whenever there's a position:
    // availableFor returns a conservative floor from the PRICEABLE collateral
    // (stale collateral uncounted; the on-chain borrow tolerates it), which is
    // always safe to show. The `stale` flag drives a "may be higher" caveat in
    // the UI — never a blank, which would hide a borrow the user can actually do.
    showCapacity: !empty,
    stale,
  };
}
