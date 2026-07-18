// Pure-compute layer for the Compound portal display.
//
// All functions here take only typed scalar inputs.  No async, no contract
// reads, no I/O.  The hooks layer (lib/portal/hooks/*.ts) fetches raw
// on-chain values via wagmi readContracts and passes them in.  This split
// keeps the math testable in isolation and lets the UI swap data sources
// (real contract vs mock fixtures) without touching the math.
//
// Convention for scaled bigints:
//   - Per-second rates and collateral factors share Compound's
//     FACTOR_SCALE = 1e18.  Convert with `Number(x) / 1e18` when the
//     magnitude is in the per-second-rate / 0..1 range — Number precision
//     is fine here, Compound's rates are tiny.
//   - Prices from comet.getPrice() are USD-scaled by 1e8 (PRICE_SCALE).
//   - Token balances stay in their raw smallest-unit (e.g. 1e18 for PCOL,
//     1e6 for wUSDC).

const FACTOR_SCALE = 10n ** 18n;
const PRICE_SCALE = 10n ** 8n;
const SECONDS_PER_YEAR = 31_536_000;

export interface CollateralPosition {
  asset: `0x${string}`;
  symbol: string;
  /** Raw on-chain balance in the asset's smallest unit. */
  balance: bigint;
  decimals: number;
  /** USD price scaled by 1e8 (from comet.getPrice). */
  priceUSDx8: bigint;
  /** Liquidation collateral factor, scaled by 1e18 (Comet's FACTOR_SCALE). */
  liquidateCollateralFactor: bigint;
  /** Borrow collateral factor, scaled by 1e18. */
  borrowCollateralFactor: bigint;
  /** Supply cap in the asset's smallest unit. */
  supplyCap: bigint;
}

export interface AccountStatsInput {
  baseToken: `0x${string}`;
  baseDecimals: number;
  /** USD price of the base asset, scaled by 1e8. */
  basePriceUSDx8: bigint;
  /** Base borrow position in base smallest-unit (from comet.borrowBalanceOf). */
  borrowBalanceBase: bigint;
  /** Base supply position in base smallest-unit (from comet.balanceOf). */
  supplyBalanceBase: bigint;
  collaterals: CollateralPosition[];
}

export interface AccountStats {
  collateralValueUSD: number;
  baseSupplyValueUSD: number;
  borrowValueUSD: number;
  /** Sum over assets of (collat_value × borrowCollateralFactor). */
  borrowCapacityUSD: number;
  /** Sum over assets of (collat_value × liquidateCollateralFactor). */
  liquidationThresholdUSD: number;
  /** Capacity − borrow, clamped at 0. */
  availableToBorrowUSD: number;
  /** liqThreshold / borrow; Infinity when borrow == 0. */
  healthFactor: number;
  /** borrow / liqThreshold; 0 when no debt, >1 when under-water. */
  liquidationRiskPct: number;
}

export interface ProtocolStatsInput {
  totalSupplyBase: bigint;
  totalBorrowBase: bigint;
  baseDecimals: number;
  basePriceUSDx8: bigint;
  /** Utilization scaled by 1e18 (from comet.getUtilization). */
  utilizationScaled: bigint;
  /** Supply rate per second scaled by 1e18 (from comet.getSupplyRate). */
  supplyRatePerSecondScaled: bigint;
  /** Borrow rate per second scaled by 1e18 (from comet.getBorrowRate). */
  borrowRatePerSecondScaled: bigint;
}

export interface ProtocolStats {
  tvlUSD: number;
  totalBorrowUSD: number;
  /** 0..1 decimal. */
  utilizationPct: number;
  /** APY as decimal (0.05 = 5%). */
  supplyApyPct: number;
  borrowApyPct: number;
  /**
   * Base liquidity available to borrow right now — raw bigint, base
   * decimals. Equal to `totalSupplyBase - totalBorrowBase` (what Comet can
   * actually send out without reverting at the SPL Token layer). Used by
   * ActionModal to gate the Borrow CTA + show the cap to the user.
   */
  availableLiquidityRaw: bigint;
}

/**
 * Convert a Compound per-second rate (scaled by 1e18) to a yearly APY decimal.
 * APY = (1 + r)^SECONDS_PER_YEAR − 1.
 */
export function decodeAPYFromPerSecondRate(perSecondRateScaled: bigint): number {
  if (perSecondRateScaled === 0n) return 0;
  const r = Number(perSecondRateScaled) / 1e18;
  return Math.pow(1 + r, SECONDS_PER_YEAR) - 1;
}

/** Utilization as a 0..1 decimal.  Returns 0 if supply is zero. */
export function computeUtilizationPct(totalSupplyBase: bigint, totalBorrowBase: bigint): number {
  if (totalSupplyBase === 0n) return 0;
  return Number(totalBorrowBase) / Number(totalSupplyBase);
}

/** USD value of a token balance given decimals and a 1e8-scaled USD price. */
function tokenAmountToUSD(balance: bigint, decimals: number, priceUSDx8: bigint): number {
  if (balance === 0n || priceUSDx8 === 0n) return 0;
  const scale = 10 ** decimals;
  const amount = Number(balance) / scale;
  const price = Number(priceUSDx8) / Number(PRICE_SCALE);
  return amount * price;
}

/** Scaled-by-1e18 factor to a Number in [0..many]. */
function factorToNumber(scaled: bigint): number {
  return Number(scaled) / Number(FACTOR_SCALE);
}

export function computeUserAccountStats(input: AccountStatsInput): AccountStats {
  let collateralValueUSD = 0;
  let borrowCapacityUSD = 0;
  let liquidationThresholdUSD = 0;

  for (const c of input.collaterals) {
    const usd = tokenAmountToUSD(c.balance, c.decimals, c.priceUSDx8);
    collateralValueUSD += usd;
    borrowCapacityUSD += usd * factorToNumber(c.borrowCollateralFactor);
    liquidationThresholdUSD += usd * factorToNumber(c.liquidateCollateralFactor);
  }

  const baseSupplyValueUSD = tokenAmountToUSD(
    input.supplyBalanceBase,
    input.baseDecimals,
    input.basePriceUSDx8,
  );
  const borrowValueUSD = tokenAmountToUSD(
    input.borrowBalanceBase,
    input.baseDecimals,
    input.basePriceUSDx8,
  );

  const healthFactor =
    borrowValueUSD === 0 ? Infinity : liquidationThresholdUSD / borrowValueUSD;
  const liquidationRiskPct =
    liquidationThresholdUSD === 0 ? 0 : borrowValueUSD / liquidationThresholdUSD;
  const availableToBorrowUSD = Math.max(0, borrowCapacityUSD - borrowValueUSD);

  return {
    collateralValueUSD,
    baseSupplyValueUSD,
    borrowValueUSD,
    borrowCapacityUSD,
    liquidationThresholdUSD,
    availableToBorrowUSD,
    healthFactor,
    liquidationRiskPct,
  };
}

/* ============================================================ */
/* Risk severity + bar fill (P1 — liquidation gauge)              */
/* ============================================================ */

export type RiskSeverity = "safe" | "ok" | "warn" | "danger" | "liquidatable";

/** Classify a liquidationRiskPct (borrow / liqThreshold) into a UI severity bucket. */
export function severityFromRisk(riskPct: number): RiskSeverity {
  if (!Number.isFinite(riskPct) || riskPct <= 0) return "safe";
  if (riskPct < 0.6) return "ok";
  if (riskPct < 0.85) return "warn";
  if (riskPct < 1.0) return "danger";
  return "liquidatable";
}

/** Bar fill width in 0..1 — clamps at 1 when over-liquidated. */
export function computeRiskBarFill(riskPct: number): number {
  if (!Number.isFinite(riskPct) || riskPct <= 0) return 0;
  return Math.min(1, riskPct);
}

/* ============================================================ */
/* Action preview compute (P3 — modal with preview)               */
/* ============================================================ */

export interface PreviewCollateralInfo {
  symbol: string;
  decimals: number;
  /** Current supplied collateral balance on the Comet (raw smallest-unit). */
  balance: bigint;
  priceUSDx8: bigint;
  borrowCollateralFactor: bigint;
  liquidateCollateralFactor: bigint;
  /** User's wallet balance of this collateral asset. */
  walletBalance: bigint;
}

export interface ActionPreviewInput {
  baseDecimals: number;
  basePriceUSDx8: bigint;
  walletBaseBalance: bigint;
  baseSupplyBalance: bigint;
  baseBorrowBalance: bigint;
  collateralValueUSD: number;
  borrowCapacityUSD: number;
  liquidationThresholdUSD: number;
  /** Per-symbol collateral info — empty when there's no collat-aware Comet. */
  collateralByAsset: Record<string, PreviewCollateralInfo>;
}

export type ActionPreviewRequest =
  | { kind: "supply"; asset: "base"; amount: bigint }
  | { kind: "withdraw"; asset: "base"; amount: bigint }
  | { kind: "supplyCollateral"; asset: string; amount: bigint }
  | { kind: "withdrawCollateral"; asset: string; amount: bigint }
  | { kind: "leverageOpen"; collateralAsset: string; collateralAmount: bigint; borrowAmount: bigint };

export interface ActionPreview {
  walletBaseAfter: bigint;
  baseSupplyAfter: bigint;
  baseBorrowAfter: bigint;
  /** Post-action collateral value in USD (sums all collaterals). */
  collateralValueAfterUSD: number;
  borrowCapacityAfterUSD: number;
  liquidationThresholdAfterUSD: number;
  /** Post-action borrow USD value. */
  borrowValueAfterUSD: number;
  /** Post-action health factor (Infinity when no debt). */
  healthFactorAfter: number;
  /** Human-readable copy for the modal preview row. */
  hint: string;
}

function previewCollateralAfter(
  state: ActionPreviewInput,
  changes: Record<string, bigint>,
): {
  collateralValueAfterUSD: number;
  borrowCapacityAfterUSD: number;
  liquidationThresholdAfterUSD: number;
} {
  let collateralValueAfterUSD = 0;
  let borrowCapacityAfterUSD = 0;
  let liquidationThresholdAfterUSD = 0;
  for (const [symbol, info] of Object.entries(state.collateralByAsset)) {
    const delta = changes[symbol] ?? 0n;
    const after = info.balance + delta;
    const usd = tokenAmountToUSD(after, info.decimals, info.priceUSDx8);
    collateralValueAfterUSD += usd;
    borrowCapacityAfterUSD += usd * factorToNumber(info.borrowCollateralFactor);
    liquidationThresholdAfterUSD += usd * factorToNumber(info.liquidateCollateralFactor);
  }
  return {
    collateralValueAfterUSD,
    borrowCapacityAfterUSD,
    liquidationThresholdAfterUSD,
  };
}

export function computeActionPreview(
  state: ActionPreviewInput,
  req: ActionPreviewRequest,
): ActionPreview {
  let walletBaseAfter = state.walletBaseBalance;
  let baseSupplyAfter = state.baseSupplyBalance;
  let baseBorrowAfter = state.baseBorrowBalance;
  let collatChanges: Record<string, bigint> = {};

  switch (req.kind) {
    case "supply":
      walletBaseAfter = state.walletBaseBalance - req.amount;
      baseSupplyAfter = state.baseSupplyBalance + req.amount;
      break;
    case "withdraw": {
      // Compound v3 semantics: withdraw burns supply first, then opens new borrow.
      const fromSupply = state.baseSupplyBalance >= req.amount ? req.amount : state.baseSupplyBalance;
      const newBorrow = req.amount - fromSupply;
      walletBaseAfter = state.walletBaseBalance + req.amount;
      baseSupplyAfter = state.baseSupplyBalance - fromSupply;
      baseBorrowAfter = state.baseBorrowBalance + newBorrow;
      break;
    }
    case "supplyCollateral":
      collatChanges[req.asset] = req.amount;
      break;
    case "withdrawCollateral":
      collatChanges[req.asset] = -req.amount;
      break;
    case "leverageOpen":
      collatChanges[req.collateralAsset] = req.collateralAmount;
      baseBorrowAfter = state.baseBorrowBalance + req.borrowAmount;
      walletBaseAfter = state.walletBaseBalance + req.borrowAmount;
      break;
  }

  const collatPreview = previewCollateralAfter(state, collatChanges);
  const borrowValueAfterUSD = tokenAmountToUSD(
    baseBorrowAfter,
    state.baseDecimals,
    state.basePriceUSDx8,
  );
  const healthFactorAfter =
    borrowValueAfterUSD === 0
      ? Infinity
      : collatPreview.liquidationThresholdAfterUSD / borrowValueAfterUSD;

  // Hint: tailored to whether this action touches health.
  let hint: string;
  if (req.kind === "supply" || req.kind === "withdraw") {
    // Base supply/withdraw doesn't change collateral. Health unchanged unless
    // the withdraw opened a new borrow.
    if (req.kind === "withdraw" && baseBorrowAfter > state.baseBorrowBalance) {
      hint =
        healthFactorAfter === Infinity
          ? "Opens borrow position"
          : `Opens borrow position · will set health to ${healthFactorAfter.toFixed(2)}x`;
    } else {
      hint = "No health change";
    }
  } else if (healthFactorAfter === Infinity) {
    hint = "No change to health (no debt)";
  } else if (req.kind === "leverageOpen" || req.kind === "withdrawCollateral") {
    hint = `Will reduce health to ${healthFactorAfter.toFixed(2)}x`;
  } else {
    hint = `Will improve health to ${healthFactorAfter.toFixed(2)}x`;
  }

  return {
    walletBaseAfter,
    baseSupplyAfter,
    baseBorrowAfter,
    collateralValueAfterUSD: collatPreview.collateralValueAfterUSD,
    borrowCapacityAfterUSD: collatPreview.borrowCapacityAfterUSD,
    liquidationThresholdAfterUSD: collatPreview.liquidationThresholdAfterUSD,
    borrowValueAfterUSD,
    healthFactorAfter,
    hint,
  };
}

export function computeProtocolStats(input: ProtocolStatsInput): ProtocolStats {
  const tvlUSD = tokenAmountToUSD(
    input.totalSupplyBase,
    input.baseDecimals,
    input.basePriceUSDx8,
  );
  const totalBorrowUSD = tokenAmountToUSD(
    input.totalBorrowBase,
    input.baseDecimals,
    input.basePriceUSDx8,
  );
  const utilizationPct = factorToNumber(input.utilizationScaled);
  const supplyApyPct = decodeAPYFromPerSecondRate(input.supplyRatePerSecondScaled);
  const borrowApyPct = decodeAPYFromPerSecondRate(input.borrowRatePerSecondScaled);
  // Base available to borrow right now. Floor at 0 — if borrow exceeded
  // supply for any reason (rounding, mid-block) we don't want a negative.
  const availableLiquidityRaw =
    input.totalSupplyBase > input.totalBorrowBase
      ? input.totalSupplyBase - input.totalBorrowBase
      : 0n;

  return {
    tvlUSD,
    totalBorrowUSD,
    utilizationPct,
    supplyApyPct,
    borrowApyPct,
    availableLiquidityRaw,
  };
}
