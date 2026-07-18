// Pure Comet → Aerarium-lane mapping.
//
// Folds the existing portal read-hooks' outputs (useReserveStats /
// useAccountStats / wallet balances) into the designer's LanePosition shape.
// No async, no contract reads — the hook (useEvmLane) fetches everything and
// passes typed scalars in here, so the mapping stays testable in isolation
// (mirrors the lib/portal/stats.ts split).
//
// USD convention: every *Bal field on LaneAsset and every total on
// LanePosition is a USD number (the presentational layer formats with fmt$).
// Raw token balances are converted to USD with the per-asset 1e8-scaled price
// from the account/reserve hooks.

import type { LaneAsset, LanePosition } from "@/components/aerarium/lane/types";
import type { ReserveStat } from "@/lib/portal/hooks/useReserveStats";
import type { AccountStats, CollateralPosition } from "@/lib/portal/stats";
import { computePositionStats } from "./positionStats";

const PRICE_SCALE = 1e8;
/** Comet collateral factors are 1e18-scaled (FACTOR_SCALE); → 0..1 ratio. */
const FACTOR_SCALE = 1e18;

/** Friendly display names for the canonical Rome wrappers. Falls back to the
 *  symbol itself for anything not in the table (the registry only carries
 *  symbols, not names). */
const NAME_BY_SYMBOL: Record<string, string> = {
  wUSDC: "USD Coin",
  USDC: "USD Coin",
  wETH: "Wrapped Ether",
  wBTC: "Wrapped Bitcoin",
  wSOL: "Wrapped SOL",
};

export function displayNameForSymbol(symbol: string): string {
  return NAME_BY_SYMBOL[symbol] ?? symbol;
}

function tokenToUSD(raw: bigint, decimals: number, priceUSDx8: bigint): number {
  if (raw === 0n || priceUSDx8 === 0n) return 0;
  return (Number(raw) / 10 ** decimals) * (Number(priceUSDx8) / PRICE_SCALE);
}

/** Raw balance → whole-token count (not USD). The amount field / Max /
 *  feasibility checks are token-denominated, so LaneAsset carries these
 *  alongside the USD `*Bal` fields. */
function tokenAmount(raw: bigint, decimals: number): number {
  if (raw === 0n) return 0;
  return Number(raw) / 10 ** decimals;
}

/** Whole-token USD price (1e8-scaled → plain number); 0 → 0. */
function priceToUsd(priceUSDx8: bigint): number {
  return priceUSDx8 === 0n ? 0 : Number(priceUSDx8) / PRICE_SCALE;
}

export interface MapEvmPositionInput {
  // Base asset identity + price
  baseSymbol: string;
  /** Optional pretty name; defaults to displayNameForSymbol(baseSymbol). */
  baseName?: string;
  baseDecimals: number;
  baseAddress: string;
  /** USD price of the base asset, 1e8-scaled (wUSDC ≈ 1e8). */
  basePriceUSDx8: bigint;

  /** Reserve rows (base first, collats after) — supplies the APYs. */
  reserves: ReserveStat[] | null;

  /** Per-user account stats (null pre-data / disconnected). */
  stats: AccountStats | null;
  /** Per-collateral user positions (raw balance + price). */
  positions: CollateralPosition[];
  baseSupplyBalance: bigint | null;
  baseBorrowBalance: bigint | null;

  /** User's wallet ERC20 balances keyed by lowercased asset address. */
  walletBalancesByAddress: Record<string, bigint>;
  /** asset address (lowercased) → display symbol. */
  symbolByAddress: Record<string, string>;

  // ---- market-level limits (the min-of-all-constraints seam) ----
  /** Base reserves available to borrow/withdraw right now, in BASE smallest
   *  units = comet.totalSupply − comet.totalBorrow (the reserves' base row).
   *  Reuses the same quantity stats.ts#computeProtocolStats derives. Optional:
   *  when omitted, the lane falls back to balance-only ceilings (no liquidity
   *  constraint). */
  availableLiquidityRaw?: bigint;
  /** Compound v3 comet.baseBorrowMin() in BASE smallest units (a borrow must
   *  leave total debt ≥ this). Optional → no minimum-borrow floor. */
  baseBorrowMinRaw?: bigint;
  /** Per-collateral protocol-total supplied (= wrapper.balanceOf(comet)) keyed
   *  by lowercased asset address, for supply-cap headroom. Optional / best-
   *  effort — the reserves' collateral `totalSupplyRaw` already carries this,
   *  so the hook can pass it straight through. */
  totalCollateralByAddress?: Record<string, bigint>;
}

/**
 * Build the designer's LanePosition from Comet reads.
 *
 * Asset ordering: base first (with supply + borrow APY, collateral:false),
 * then one row per collateral (supplyApy from reserves, borrowApy 0,
 * collateral:true). USD framing per the LaneAdapter contract:
 *   - supplied = baseSupplyValueUSD + collateralValueUSD
 *   - borrowed = borrowValueUSD
 *   - capacity = borrowCapacityUSD
 *   - healthFactor = stats.healthFactor (Infinity clamped for display)
 */
export function mapEvmPosition(input: MapEvmPositionInput): LanePosition {
  const reserves = input.reserves ?? [];
  const baseLc = input.baseAddress.toLowerCase();

  // Index reserve APYs + collateral prices/balances by lowercased address.
  const reserveByAddr = new Map<string, ReserveStat>();
  for (const r of reserves) reserveByAddr.set(r.asset.toLowerCase(), r);

  const positionByAddr = new Map<string, CollateralPosition>();
  for (const p of input.positions) positionByAddr.set(p.asset.toLowerCase(), p);

  // Price map (address → 1e8 USD) for wallet-balance USD conversion.
  // Collats carry priceUSDx8 in their position rows even at zero balance;
  // base price is passed explicitly.
  const priceByAddr = new Map<string, bigint>();
  priceByAddr.set(baseLc, input.basePriceUSDx8);
  for (const p of input.positions) priceByAddr.set(p.asset.toLowerCase(), p.priceUSDx8);

  const baseReserve = reserveByAddr.get(baseLc);
  const baseSym = input.baseSymbol;
  const baseDec = input.baseDecimals;
  const baseWalletRaw = input.walletBalancesByAddress[baseLc] ?? 0n;

  // Value the base from its raw balance × the (≈$1) base price, NOT stats'
  // feed-derived USD. The base is the unit of account; useAccountStats computes
  // baseSupplyValueUSD off the base price feed, which can revert StalePriceFeed
  // → $0 and wrongly zero a real supplied/borrowed base balance (rendering "—"
  // and "No position yet"). This mirrors the Solana lane, which already values
  // the base from tokens × BASE_PRICE_USDx8.
  const baseSupplyUSD = tokenToUSD(input.baseSupplyBalance ?? 0n, baseDec, input.basePriceUSDx8);
  const baseBorrowUSD = tokenToUSD(input.baseBorrowBalance ?? 0n, baseDec, input.basePriceUSDx8);

  const baseAsset: LaneAsset = {
    sym: baseSym,
    name: input.baseName ?? displayNameForSymbol(baseSym),
    supplyApy: baseReserve?.supplyApyPct ?? 0,
    borrowApy: baseReserve?.borrowApyPct ?? 0,
    // The Comet base asset is the only borrowable asset — independent of the
    // (possibly 0 / unloaded) borrowApy.
    borrowable: true,
    walletBal: tokenToUSD(baseWalletRaw, baseDec, input.basePriceUSDx8),
    suppliedBal: baseSupplyUSD,
    borrowedBal: baseBorrowUSD,
    // Token-unit balances from the raw reads the hook already fetches. Base
    // supplied/borrowed come from the raw comet balances (not the USD stats).
    walletTokens: tokenAmount(baseWalletRaw, baseDec),
    suppliedTokens: tokenAmount(input.baseSupplyBalance ?? 0n, baseDec),
    borrowedTokens: tokenAmount(input.baseBorrowBalance ?? 0n, baseDec),
    priceUsd: priceToUsd(input.basePriceUSDx8),
    priceKnown: input.basePriceUSDx8 > 0n,
    collateral: false,
    // The base asset contributes no borrow capacity — CF 0 (so a base withdraw
    // is never sized against a freed-capacity ceiling; see laneActions).
    borrowCollateralFactor: 0,
    address: input.baseAddress,
    // EVM lane: display the EVM wrapper address as the on-chain identity.
    displayAddress: input.baseAddress,
    decimals: baseDec,
  };

  // Collateral roster. The asset list is an ON-CHAIN fact — it must NOT vanish
  // because the USD/APY cache (reserves, sourced from /api/market) blipped. So
  // prefer the reserve table's collateral rows when present (they carry APY +
  // protocol totals AND render before the wallet-specific position read lands),
  // but fall back to the on-chain `positions` roster when reserves is unavailable.
  // Without this, a transient /api/market outage left reserves=null → only the
  // base row rendered, hiding supplied collateral even while capacity (a SEPARATE
  // on-chain read) still showed it existed (screenshot #39). reserve + position
  // are now both optional per-asset overlays; either alone keeps the row visible.
  const reserveCollatAddrs = reserves.filter((r) => r.kind === "collateral").map((r) => r.asset.toLowerCase());
  const collatAddrs = reserveCollatAddrs.length > 0 ? reserveCollatAddrs : input.positions.map((p) => p.asset.toLowerCase());

  const collatAssets: LaneAsset[] = collatAddrs.map((addr) => {
    const r = reserveByAddr.get(addr); // optional APY / protocol-total overlay
    const pos = positionByAddr.get(addr); // optional user balance / price / caps
    const sym = input.symbolByAddress[addr] ?? pos?.symbol ?? `asset`;
    const decimals = pos?.decimals ?? r?.decimals ?? 0;
    const price = priceByAddr.get(addr) ?? pos?.priceUSDx8 ?? 0n;
    const walletRaw = input.walletBalancesByAddress[addr] ?? 0n;
    const suppliedRaw = pos?.balance ?? 0n;
    const suppliedUSD = pos ? tokenToUSD(suppliedRaw, decimals, pos.priceUSDx8) : 0;
    // Supply-cap headroom (best-effort): how much MORE of this collateral the
    // protocol will accept = max(0, supplyCap − totalProtocolSupply). Both raw
    // token units → whole tokens. Undefined when either the cap (0 = "no cap"
    // in Compound) or the protocol-total isn't available, so availableFor
    // falls back to wallet-only for supply. The protocol-total comes from the
    // reserves' collateral totalSupplyRaw (= wrapper.balanceOf(comet)).
    const supplyCapRaw = pos?.supplyCap ?? 0n;
    const totalSuppliedRaw = input.totalCollateralByAddress?.[addr] ?? r?.totalSupplyRaw ?? undefined;
    const supplyHeadroomTokens =
      supplyCapRaw > 0n && totalSuppliedRaw !== undefined
        ? Math.max(0, tokenAmount(supplyCapRaw - totalSuppliedRaw, decimals))
        : undefined;
    // Checksummed identity from whichever source has it (one always does, since
    // addr came from reserve-collats or positions); lowercased addr as last resort.
    const assetAddr = r?.asset ?? pos?.asset ?? addr;
    // Borrow collateral factor (0..1) from the SAME 1e18-scaled factor the
    // account stats use for capacity (carried on the per-asset position row).
    // 0 when the position read isn't available — laneActions then sizes a
    // collateral withdraw off the raw headroom (matching its CF-0 fallback).
    const borrowCollateralFactor = pos ? Number(pos.borrowCollateralFactor) / FACTOR_SCALE : 0;
    return {
      sym,
      name: displayNameForSymbol(sym),
      supplyApy: r?.supplyApyPct ?? 0, // collats don't earn — null/absent coerced to 0
      borrowApy: 0, // collateral-only: displayed borrow rate is 0
      borrowable: false, // collateral — supply-only
      walletBal: tokenToUSD(walletRaw, decimals, price),
      suppliedBal: suppliedUSD,
      borrowedBal: 0,
      walletTokens: tokenAmount(walletRaw, decimals),
      suppliedTokens: tokenAmount(suppliedRaw, decimals),
      borrowedTokens: 0,
      priceUsd: priceToUsd(price),
      priceKnown: price > 0n,
      collateral: true,
      borrowCollateralFactor,
      supplyHeadroomTokens,
      address: assetAddr,
      displayAddress: assetAddr,
      decimals,
    } satisfies LaneAsset;
  });

  const assets = [baseAsset, ...collatAssets];

  // Market-level limits (USD). Liquidity = base reserves available now
  // (totalSupply − totalBorrow of the base, × base price ≈ $1) — the SAME
  // quantity stats.ts derives as availableLiquidityRaw. baseBorrowMin → USD.
  const basePrice = priceToUsd(input.basePriceUSDx8);
  const limits =
    input.availableLiquidityRaw !== undefined || input.baseBorrowMinRaw !== undefined
      ? {
          // Liquidity still loading (reserves not fetched yet) is UNKNOWN, not
          // unbounded — default to 0 so borrow/base-withdraw GATE until it's known.
          // Infinity here let the full collateral capacity bind, so Max filled the
          // whole capacity (e.g. 82,188 wUSDC) which reverts on-chain.
          availableLiquidityUsd:
            input.availableLiquidityRaw !== undefined
              ? tokenToUSD(input.availableLiquidityRaw, input.baseDecimals, input.basePriceUSDx8)
              : 0,
          baseBorrowMinUsd:
            input.baseBorrowMinRaw !== undefined
              ? tokenAmount(input.baseBorrowMinRaw, input.baseDecimals) * basePrice
              : 0,
        }
      : undefined;

  // Totals + health + pricesStale via the one shared calc both lanes use
  // (computePositionStats). supplied/borrowed are derived from `assets` so the
  // header always matches the visible rows. capacity + healthFactor are the two
  // EVM-specific scalars: capacity from the account stats hook; healthFactor is
  // Comet's real liquidation-based factor (null pre-data → no-debt sentinel).
  return {
    ...computePositionStats(assets, {
      capacityUsd: input.stats?.borrowCapacityUSD ?? 0,
      healthFactor: input.stats ? input.stats.healthFactor : null,
    }),
    assets,
    limits,
  };
}
