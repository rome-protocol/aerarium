// @vitest-environment jsdom
//
// HealthCapacity is the elevated account-risk readout on the lane home (the
// action surface), replacing the big 4-metric PositionSummary card (that full
// aggregate is the dashboard's job now). It highlights the three facts that are
// decision-relevant WHILE you act: Health factor + risk band, available-to-borrow
// $ (the actionable number, from availableFor), and borrow-capacity used.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HealthCapacity } from "../HealthCapacity";
import type { LaneAsset, LanePosition } from "../types";
import { HEALTH_FACTOR_NO_DEBT } from "@/lib/lane/positionStats";

const base: LaneAsset = {
  sym: "wUSDC", name: "USD Coin", supplyApy: 5, borrowApy: 7, borrowable: true,
  walletBal: 0, suppliedBal: 0, borrowedBal: 200, walletTokens: 0, suppliedTokens: 0, borrowedTokens: 200, priceUsd: 1,
  borrowCollateralFactor: 0,
};
const pos = (over: Partial<LanePosition> = {}): LanePosition => ({
  supplied: 2000, borrowed: 200, capacity: 800, healthFactor: 2.5, netApr: 1,
  assets: [base], limits: { availableLiquidityUsd: 5000, baseBorrowMinUsd: 1 }, ...over,
});

describe("HealthCapacity — elevated lane-home risk readout", () => {
  it("shows the health factor and a 'Safe' band when HF ≥ 2", () => {
    render(<HealthCapacity position={pos({ healthFactor: 2.5 })} baseAsset={base} empty={false} />);
    expect(screen.getByText("2.50")).toBeInTheDocument();
    expect(screen.getByText(/safe/i)).toBeInTheDocument();
  });

  it("bands HF 1.25–2 as 'Caution' and < 1.25 as 'At risk'", () => {
    const { rerender } = render(<HealthCapacity position={pos({ healthFactor: 1.5 })} baseAsset={base} empty={false} />);
    expect(screen.getByText(/caution/i)).toBeInTheDocument();
    rerender(<HealthCapacity position={pos({ healthFactor: 1.1 })} baseAsset={base} empty={false} />);
    expect(screen.getByText(/at risk/i)).toBeInTheDocument();
  });

  it("highlights available-to-borrow $ = min(capacity headroom, liquidity)", () => {
    // capacity 800 − borrowed 200 = 600 headroom; liquidity 5000 → bound by capacity → $600.00
    render(<HealthCapacity position={pos()} baseAsset={base} empty={false} />);
    expect(screen.getByText("$599.40")).toBeInTheDocument();
  });

  it("shows borrow-capacity used (borrowed / capacity)", () => {
    render(<HealthCapacity position={pos()} baseAsset={base} empty={false} />);
    expect(screen.getByText(/\$200\s*\/\s*\$800/)).toBeInTheDocument();
  });

  it("renders an empty readout (—) when there's no position yet", () => {
    render(<HealthCapacity position={pos({ supplied: 0, borrowed: 0, capacity: 0, healthFactor: 0 })} baseAsset={base} empty />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText(/at risk/i)).toBeNull();
  });

  it("with NO debt + a stale feed → shows SAFE health AND the borrowable capacity FLOOR (not blanked)", () => {
    // #240 + the priceStale floor fix: with $0 borrowed you're safe, and your
    // FRESH collateral still gives real borrow capacity even though an exotic feed
    // is stale (the on-chain borrow succeeds against the fresh collateral). Show
    // both; the stale feed just caveats that capacity may be higher.
    render(
      <HealthCapacity
        position={pos({ healthFactor: HEALTH_FACTOR_NO_DEBT, capacity: 600, borrowed: 0, pricesStale: true })}
        baseAsset={base}
        empty={false}
      />,
    );
    expect(screen.getByText(/safe/i)).toBeInTheDocument(); // health shown, not blanked
    expect(screen.queryByText(/at risk/i)).toBeNull(); // no fake risk band
    expect(screen.getByText("$599.40")).toBeInTheDocument(); // capacity FLOOR shown, not "—"
    // …with an honest "prices updating" caveat (capacity may be higher).
    expect(screen.getAllByText(/updating|unavailable/i).length).toBeGreaterThan(0);
  });

  it("with debt + a stale feed → blanks health (genuinely unknown), no fabricated number", () => {
    render(
      <HealthCapacity
        position={pos({ healthFactor: 0, capacity: 0, borrowed: 200, pricesStale: true })}
        baseAsset={base}
        empty={false}
      />,
    );
    expect(screen.queryByText(/at risk/i)).toBeNull(); // no fake risk band
    expect(screen.queryByText("0.00")).toBeNull(); // no fake health number
    expect(screen.getAllByText(/updating|unavailable/i).length).toBeGreaterThan(0);
  });
});
