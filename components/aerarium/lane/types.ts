// =====================================================================
// AERARIUM — connected lane: data + adapter seam
// One <LaneApp adapter={…} /> renders both lanes. Everything that differs
// between EVM and Solana lives behind this LaneAdapter interface: the wallet
// list, connection, Solana provisioning (Activate), position/asset reads, and
// the action lifecycle. The presentational components + LaneApp are pure and
// chain-agnostic; only the adapter implementations (useEvmLane / useSolanaLane)
// know how to talk to wagmi or lib/solana.
// =====================================================================
import type { Side } from "@/lib/market/MarketSource";

export type LaneSide = Side; // "evm" | "sol"

export type ActionType = "supply" | "withdraw" | "borrow" | "repay";

export interface LaneAsset {
  sym: string;
  name: string;
  supplyApy: number;
  /** Displayed borrow rate (may legitimately read 0). Does NOT gate the borrow
   *  column / tabs — use `borrowable` for that. */
  borrowApy: number;
  /** Whether this asset can be borrowed. In a Compound v3 Comet only the base
   *  asset is borrowable; collaterals are supply-only. Gates [Supply][Borrow]
   *  vs [Supply][Manage] in AssetRow and the 4-vs-2 tab set in ActionPanel —
   *  decoupled from borrowApy so a 0/unloaded rate never hides the base's
   *  borrow path. */
  borrowable: boolean;
  /** USD values (the presentational layer formats with fmt$). */
  walletBal: number;
  suppliedBal: number;
  borrowedBal: number;
  /** Same balances expressed in the asset's OWN token units (not USD). The
   *  amount field, Max, and feasibility validation are all token-denominated, so
   *  these — not the USD `*Bal` fields — are the source of truth for laneActions.
   *  For the $1 base wUSDC tokens ≈ USD, but for collaterals (e.g. wETH ≈ $3000)
   *  they differ by the price factor; using a USD number as a token Max is wrong.
   *  Populated by both mappers from the same raw reads + decimals. */
  walletTokens: number;
  suppliedTokens: number;
  borrowedTokens: number;
  /** 1e8-scaled USD price of one whole token (base ≈ 1e8). Lets laneActions
   *  convert a token amount → USD for the borrow-capacity check without
   *  re-reading chain. Optional: defaults to deriving from walletBal/walletTokens
   *  or, failing that, $1. */
  priceUsd?: number;
  /** Whether this asset's USD price is KNOWN. False when the OG-V2 feed is stale
   *  and `getPrice` reverts `StalePriceFeed` (the lane reads priceUSDx8 = 0).
   *  Consumers render the token amount (not "—"/$0) and gate honestly on a
   *  stale feed rather than presenting it as "$0 / at risk". Optional →
   *  treated as `true` (known) by older fixtures that predate the seam. */
  priceKnown?: boolean;
  collateral?: boolean;
  /** Compound v3 borrow collateral factor as a 0..1 ratio (Comet's 1e18-scaled
   *  factor ÷ 1e18). The base asset / any non-collateral row is 0. Lets
   *  laneActions size a collateral WITHDRAW against the capacity it actually
   *  frees: withdrawing `w` USD of collateral lowers borrow capacity by `w × CF`,
   *  so the max withdrawable against the freed-capacity ceiling is
   *  (capacity − borrowed) / CF, not (capacity − borrowed). Both mappers thread
   *  it from the SAME on-chain factor they already read for capacity. */
  borrowCollateralFactor: number;
  /** Per-collateral supply-cap headroom in TOKEN units = max(0, supplyCap −
   *  totalProtocolSupply(asset)). Caps how much MORE can be supplied of this
   *  collateral (the base asset has no cap). Best-effort: undefined when the
   *  cap / protocol-totals data isn't available, in which case the supply
   *  ceiling falls back to the wallet balance alone. See availableFor. */
  supplyHeadroomTokens?: number;
  // Real adapters may carry on-chain identifiers; the UI ignores them.
  address?: string;
  decimals?: number;
  /** Lane-appropriate on-chain identity to DISPLAY under the symbol: the EVM
   *  wrapper address on /evm, the underlying SPL mint on /solana. The address is
   *  the canonical identity — symbol/name are display-only and can read "asset"
   *  before the on-chain symbol resolves, so rows disambiguate on this. */
  displayAddress?: string;
}

/**
 * Market-level limits that bound actions independently of the user's own
 * balances — the structural seam for the min-of-all-constraints model (see
 * laneActions.availableFor). Wallet-independent, so BOTH lanes read the same
 * numbers for the same Comet. USD-denominated (the lane's convention).
 */
export interface LaneLimits {
  /** Base reserves available to borrow / withdraw RIGHT NOW, in USD =
   *  (comet.totalSupply − comet.totalBorrow) of the base × base price (≈ $1).
   *  You can't borrow base that isn't there, and you can't withdraw supplied
   *  base past what the Comet can pay out. Floored at 0. */
  availableLiquidityUsd: number;
  /** Compound v3 `baseBorrowMin` in USD — a borrow must leave the position's
   *  total debt at or above this floor (the protocol rejects dust borrows).
   *  0 when unknown / not applicable. */
  baseBorrowMinUsd: number;
}

export interface LanePosition {
  supplied: number;
  borrowed: number;
  capacity: number;
  healthFactor: number;
  netApr: number;
  assets: LaneAsset[];
  /** True when at least one collateral the user holds has an UNKNOWN price (its
   *  OG-V2 feed is stale / reverting). The health + capacity totals can't be
   *  trusted in that state, so the UI surfaces "values unavailable — price feed
   *  updating" instead of a fabricated "0.00 AT RISK" / "$0 capacity". Optional
   *  → false for fixtures that predate the seam. */
  pricesStale?: boolean;
  /** Market-level constraints for the min-of-all-constraints action model.
   *  Optional so older fixtures / partial reads still type-check; availableFor
   *  treats a missing `limits` as "no liquidity / min constraint known" and
   *  falls back to the balance-only ceilings. */
  limits?: LaneLimits;
}

export interface SignStep {
  label: string;
  tag: "Sign" | "Wait" | "Done";
}

export interface ActivityItem {
  id: string | number;
  time: string;
  verb: string;
  amount: number;
  sym: string;
  txUrl?: string;
}

/**
 * The transient result of the most-recent SUCCESSFUL action — set by the
 * adapter on success, consumed by LaneApp to render a one-shot success
 * confirmation ("✓ Supplied $100.00 wUSDC" + a view-tx link). Cleared when the
 * next submit starts and on clearError / disconnect, so it's a momentary banner,
 * not persistent state. `verb` is the past-tense form ("Supplied"/"Withdrew"/
 * "Borrowed"/"Repaid"/"Activated account"); `amount` is the USD number (0 for
 * Activate, where the banner shows verb only).
 */
export interface ActionResult {
  verb: string;
  amount: number;
  sym: string;
  txUrl?: string;
}

export type LaneConnectionStatus = "disconnected" | "connecting" | "connected";

export interface LaneConnection {
  status: LaneConnectionStatus;
  address?: string;
  /** Display name of the connected wallet (e.g. "MetaMask" / "Phantom"). */
  wallet?: string;
}

export interface SubmitActionInput {
  asset: LaneAsset;
  type: ActionType;
  amount: string;
}

/**
 * The per-lane behavior contract. An adapter is a React hook returning this
 * shape; it owns the connection / provisioning / position / action state and
 * exposes void imperative methods that mutate that state internally (the hook
 * re-renders on change, mirroring the prototype's fire-and-forget transitions).
 */
export interface LaneAdapter {
  chain: LaneSide;
  /** Wallet display names for the ConnectCard (EVM: MetaMask/Rabby/WalletConnect; Solana: Phantom/Solflare/Backpack). */
  wallets: string[];

  connection: LaneConnection;
  connect: (wallet: string) => void;
  disconnect: () => void;

  // Solana first-time provisioning. EVM is always provisioned; activate() no-ops.
  provisioned: boolean;
  activating: boolean;
  /** Index into ACTIVATE_STEPS (0 = none done yet). */
  activateStep: number;
  activate: () => void;

  /** Empty state => supplied/borrowed/… are 0; `assets` is always populated. */
  position: LanePosition;
  hasPosition: boolean;
  /** True while the FIRST position read after connect is in flight. Lets the UI
   *  show "Loading your positions…" instead of flashing "No position yet" before
   *  the reads land; goes false once the first read completes (empty or not). */
  positionLoading: boolean;
  /** Recent activity: a de-duped merge of the adapter's OWN optimistic entries
   *  (the actions it just completed, most-recent-first) and the fetched on-chain
   *  feed. The Solana lane's fetched feed is empty (Rome doesn't surface
   *  DoTxUnsigned via eth_getLogs), so its optimistic entries are the feed. */
  activity: ActivityItem[];
  /** Transient confirmation of the most-recent successful action; null when
   *  none / cleared. LaneApp renders a success banner from it. */
  lastResult: ActionResult | null;

  // Action lifecycle. submitAction kicks off the (possibly multi-signature)
  // flow; signing/signStep drive the ProgressCard.
  submitAction: (input: SubmitActionInput) => void;
  signing: boolean;
  /** Index into `signPlan`. */
  signStep: number;
  /** The EXACT signing steps for the in-flight action, built from live
   *  preconditions (approve needed? wallet-ATA creation needed?) so the popup
   *  count shown always matches what the user will sign. Empty when not signing. */
  signPlan: SignStep[];

  error: string | null;
  clearError: () => void;
}
