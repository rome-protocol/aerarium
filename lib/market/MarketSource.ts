export type Side = "evm" | "sol";

export interface PoolSplit {
  /** base-asset (USDC) supplied — the lend side */
  totalSupplied: number;
  /** base-asset (USDC) borrowed — the borrow side */
  totalBorrowed: number;
  /** Σ USD of all collateral assets backing the borrows (wBTC/wETH/wSOL/…) */
  totalCollateral: number;
  netApr: number;
  supplyApr: number;
  borrowApr: number;
  /** liquidity originated from EVM wallets */
  suppliedEvm: number;
  /** liquidity originated from Solana wallets */
  suppliedSol: number;
  borrowedEvm: number;
  borrowedSol: number;
  suppliers: number;
  /** borrow utilization as a whole-number percentage (0–100) */
  utilization: number;
  /** true when values are placeholder (preview); false when sourced live on-chain. */
  illustrative: boolean;
}

export interface ArenaSide {
  liquidationsWon: number;
  valueSeized: number;
  biggestHit: number;
  positionsDefended: number;
  /** current win streak */
  streak: number;
}

export interface ArenaStats {
  evm: ArenaSide;
  sol: ArenaSide;
  /** true when placeholder (preview); false when sourced live from the indexer. */
  illustrative: boolean;
}

export type ActivityAction = "supply" | "withdraw" | "liquidate" | "other";

/** One recent cross-lane action on the comet (from the indexer). */
export interface ActivityRow {
  txHash: string;
  action: ActivityAction;
  /** token symbol moved (e.g. "wUSDC"), or "—" if unresolved */
  asset: string;
  /** token-unit amount moved */
  amount: number;
  /** EVM lane (ecdsa origin) vs Solana lane */
  lane: Side;
  /** human age, e.g. "2m" / "3h" / "5d" */
  age: string;
  illustrative: boolean;
}

export interface OpenLiquidation {
  id: string;
  side: Side;
  borrower: string;
  collateral: string;
  collateralUsd: number;
  debt: string;
  health: number;
  /** liquidation reward in USD */
  reward: number;
  /** age of position as a human-readable string, e.g. "2m" */
  age: string;
  /** true when placeholder (preview); false when sourced live. */
  illustrative: boolean;
}

export interface MarketRow {
  asset: string;
  kind: string;
  supplyApy: number;
  borrowApy: number;
  /** total market size in USD */
  total: number;
  /** borrow utilization as a whole-number percentage (0–100) */
  util: number;
  chains: Side[];
  /** Collateral rows only: max borrowing power (borrowCollateralFactor) as a
   *  percent (e.g. 80 = 80% LTV). Undefined for the base asset. */
  collateralFactorPct?: number;
}

export interface MarketSource {
  poolSplit(): Promise<PoolSplit>;
  arenaStats(): Promise<ArenaStats>;
  openLiquidations(): Promise<OpenLiquidation[]>;
  markets(): Promise<MarketRow[]>;
  /** Recent cross-lane actions on the comet (newest first). */
  recentActivity(): Promise<ActivityRow[]>;
}
