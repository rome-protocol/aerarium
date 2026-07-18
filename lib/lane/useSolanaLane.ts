"use client";
// =====================================================================
// AERARIUM — Solana lane adapter (real)
// Implements the LaneAdapter contract for the Solana-native lane (/solana): a
// Phantom/Solflare/Backpack wallet drives EVM Compound-v3 (Comet) actions on
// Rome with NO Ethereum key, via DoTxUnsigned. The user's EVM identity
// is the SYNTHETIC address keccak(solana_pubkey)[12:] (lib/solana/identity).
//
// This hook is the React/wallet shell only — it REUSES the proven flows from the
// discovery probe (app/discovery/page.tsx) by calling the same lib/solana
// primitives: account discovery (rome_emulateCallAccounts via /api/discovery),
// DoTxUnsigned submit, persistent ALTs, ActivateAta/create_pda, Comet calldata.
// Reads target the SAME Comet, for the synthetic address, via viem over
// /api/rome-rpc — identical contract calls to the probe's readState. The pure
// reads→LanePosition mapping lives in mapSolanaPosition.ts (unit-tested).
//
// Structure mirrors useEvmLane: a stable submitAction (useCallback([])) reads
// fresh state through a ref, normalises errors, and refreshes after each action.
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type AccountMeta,
} from "@solana/web3.js";
import {
  createPublicClient,
  http,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { syntheticAddress } from "@/lib/solana/identity";
import { resolveProbeConfig } from "@/lib/solana/probeConfig";
import { clusterToChain, makeChainAwareSign, type BareSign } from "@/lib/solana/signWithChain";
import { solanaExplorerTx } from "@/lib/solana/explorer";
import {
  submitDoTxUnsigned,
  submitV0Instructions,
  submitInstructions,
  computeBudgetIxs,
  externalAuthPda,
  associatedTokenAddress,
} from "@/lib/solana/submit";
import { fetchPersistentAlts } from "@/lib/solana/persistentAlts";
import { buildDoTxUnsigned } from "@/lib/solana/instructions";
import { buildUnsignedEip1559Rlp } from "@/lib/solana/unsignedTx";
import { emulateCallAccounts } from "@/lib/solana/discovery";
import { buildFundLeg, buildSweepLeg } from "@/lib/solana/syntheticTransientFlows";
import { encodeApprove, encodeRepay } from "@/lib/solana/cometCalldata";
import { estimateGasBuffered } from "@/lib/gas";
import { fetchRecentActivity } from "@/lib/portal/activity";
import { configForChain } from "@/lib/config";
import { useEnv } from "@/lib/env-context";
import type {
  ActionResult,
  ActionType,
  ActivityItem,
  LaneAdapter,
  LaneConnectionStatus,
  LaneLimits,
  SignStep,
  SubmitActionInput,
} from "@/components/aerarium/lane/types";
import { signSteps } from "@/components/aerarium/lane/primitives";
import { readCometAssetSymbols } from "./cometAssetSymbols";
import {
  COMET_ABI,
  PRICE_FEED_ABI,
  mcResult,
  type MCEntry,
} from "./solanaReads";
import { readSolanaMetaCache, writeSolanaMetaCache } from "./solanaMetaCache";
import {
  mapSolanaPosition,
  type SolanaAssetRead,
  type SolanaAssetResolved,
} from "./mapSolanaPosition";
import { hasHoldings } from "./laneActions";
import { usePositionQuery } from "./usePositionQuery";
import { fetchSolanaPosition, type SolanaPositionResult } from "./solanaPositionFetcher";
import { toLaneActivity, optimisticEntry, mergeActivity, type AssetLookup } from "./laneActivity";
import { useSolanaConnect } from "./useSolanaConnect";
import { useProvisionedCheck } from "./useProvisionedCheck";

// Solana-explorer tx link for a signature — this chain's txs land on its Solana
// cluster, which IS CORS-exposed to explorer.solana.com (the registry chain.json
// explorerUrl points at the EVM-side rome-via, which can't resolve a Solana sig).
// Same pattern as app/discovery + the Solana faucet/liquidate pages.

// MCEntry + mcResult are shared with the batched-read module (./solanaReads).

// SPL Token program — the demo wrappers + Circle devnet USDC are standard SPL.
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

// HelperProgram precompile (0xff..09). create_pda(user) creates the synthetic's
// external_auth PDA — REQUIRED before its ATA (the ATA is owned by this PDA).
const HELPER_PROGRAM = "0xff00000000000000000000000000000000000009" as Address;

// Account-discovery + DoTxUnsigned submit go through the SAME same-origin routes
// the discovery probe uses: /api/discovery forwards to the #353 proxy
// (DISCOVERY_PROXY_UPSTREAM, default localhost:9090). The DoTxUnsigned itself
// submits over the wallet-adapter `connection` (useConnection), whose endpoint
// is the same-origin /api/solana-rpc proxy → private SOLANA_RPC server-side
// (providers-solana.tsx).
const DISCOVERY_ROUTE = "/api/discovery";

// Base wUSDC ≈ $1 on the demo chains; collateral prices come from the Comet feed.
const BASE_PRICE_USDx8 = 100_000_000n;


// Multicall3 (from the chain config / rome-protocol/registry — same one
// lib/wagmi.ts uses for the EVM lane). Lets viem fold the lane's ~50 per-asset
// reads into a few aggregate3 eth_calls. Without batching, 9 assets × sequential
// single reads ≈ 50s on Rome (one emulation per call) and one reverting read
// blanks the whole refresh; batched it's ~2s and allowFailure isolates a bad asset.
const CREATE_PDA_ABI = [
  { type: "function", name: "create_pda", stateMutability: "nonpayable", inputs: [{ name: "user", type: "address" }], outputs: [] },
] as const;

const ENSURE_ATA_ABI = [
  { type: "function", name: "ensure_token_account", stateMutability: "nonpayable", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "bytes32" }] },
] as const;

const MINT_ID_ABI = [
  { type: "function", name: "mint_id", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bytes32" }] },
] as const;

// COMET_ABI + PRICE_FEED_ABI are shared with the batched-read module
// (./solanaReads) so the read surface has a single definition.

// Friendly names for the demo wrappers (registry only carries symbols).
const NAME_BY_SYMBOL: Record<string, string> = {
  wUSDC: "USD Coin",
  wETH: "Wrapped Ether",
  wSOL: "Wrapped SOL",
  wBTC: "Wrapped Bitcoin",
};
function symbolToName(sym: string): string {
  return NAME_BY_SYMBOL[sym] ?? sym;
}

function mapWalletStatus(connecting: boolean, connected: boolean, hasKey: boolean): LaneConnectionStatus {
  if (connected && hasKey) return "connected";
  if (connecting) return "connecting";
  return "disconnected";
}

// Literal NEXT_PUBLIC_ refs so Next inlines them client-side (same as discovery).
const ENV = {
  NEXT_PUBLIC_DISCOVERY_PROXY_URL: process.env.NEXT_PUBLIC_DISCOVERY_PROXY_URL,
  NEXT_PUBLIC_SOLANA_RPC: process.env.NEXT_PUBLIC_SOLANA_RPC,
  NEXT_PUBLIC_ROME_EVM_PROGRAM: process.env.NEXT_PUBLIC_ROME_EVM_PROGRAM,
  NEXT_PUBLIC_ROME_CHAIN_ID: process.env.NEXT_PUBLIC_ROME_CHAIN_ID,
  NEXT_PUBLIC_COMET_PROXY: process.env.NEXT_PUBLIC_COMET_PROXY,
  NEXT_PUBLIC_UNIFIED_TOKEN: process.env.NEXT_PUBLIC_UNIFIED_TOKEN,
};

interface AssetMeta {
  symbol: string;
  address: Address;
  isBase: boolean;
  decimals: number;
  // collateral-only static config (cached once; the base asset has none).
  priceFeed?: Address;
  priceFeedDecimals?: number;
  borrowCollateralFactorE18: bigint;
  /** Underlying SPL mint (wrapper.mint_id()), base58. String (not PublicKey) so
   *  it round-trips through the JSON meta cache. refreshPosition reads the user's
   *  WALLET ATA balance from it for the look-ahead "spendable" source. */
  mint?: string;
}

export function useSolanaLane(): LaneAdapter {
  // Runtime chain id from /api/env (EnvProvider) so one image picks its chain at
  // deploy time — NEXT_PUBLIC_ROME_CHAIN_ID still wins as a build-time pin. cfg
  // recomputes when the runtime value resolves (null → number).
  const { defaultChainId } = useEnv();
  const cfg = useMemo(() => resolveProbeConfig(ENV, defaultChainId), [defaultChainId]);
  const { connection } = useConnection();
  const {
    publicKey,
    connected,
    connecting,
    wallet,
    signTransaction,
  } = useWallet();

  // Chain-aware sign: forward the registry cluster as the wallet-standard
  // `chain` on every sign request so Phantom previews on the right cluster (its
  // connect default is mainnet-beta, where the devnet rome-evm program + ALTs
  // don't exist → "Failed to simulate"). Falls back to the bare signTransaction
  // for non-standard adapters. See lib/solana/signWithChain.ts.
  const signTx = useMemo<BareSign | undefined>(() => {
    if (!signTransaction) return undefined;
    return makeChainAwareSign(wallet?.adapter ?? null, signTransaction, clusterToChain(cfg.solanaCluster));
  }, [wallet, signTransaction, cfg.solanaCluster]);
  // Connect/disconnect go through the SHARED robust helper — the SAME one
  // SolanaLaneShell's ConnectCard uses — so the main lane and the sub-pages
  // behave identically and the select()/connect() race is fixed in one place.
  const { connect: connectWallet, disconnect: disconnectWallet } = useSolanaConnect();

  const synthetic = useMemo<Hex | null>(
    () => (publicKey ? syntheticAddress(publicKey) : null),
    [publicKey],
  );

  const status = mapWalletStatus(connecting, connected, !!publicKey);

  // viem read client over the demo's /api/rome-rpc proxy (same as discovery's
  // evmClient) — reads the synthetic's Comet/wrapper balances.
  const evmClient = useMemo<PublicClient>(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const chain = defineChain({
      id: cfg.chainId,
      name: "Rome",
      nativeCurrency: { name: "gas", symbol: "GAS", decimals: 18 },
      rpcUrls: { default: { http: [`${origin}/api/rome-rpc`] } },
      // multicall3 lets viem batch the lane's per-asset reads into aggregate3
      // eth_calls (see MULTICALL3 note) — the same speed-up the EVM lane gets.
      contracts: cfg.multicall3 ? { multicall3: { address: cfg.multicall3 } } : undefined,
    });
    return createPublicClient({ chain, transport: http(`${origin}/api/rome-rpc`) });
  }, [cfg.chainId]);

  // ---- provisioning (Activate gate) ----
  // provisioned = the synthetic's external_auth PDA exists on-chain. The check is
  // owned by useProvisionedCheck so it RE-RUNS when its inputs resolve — crucially
  // cfg.programId, which flips from the build-time DEFAULT chain's program to the
  // real one only after /api/env resolves (it arrives AFTER the wallet auto-connects
  // on a refresh). Gating just on [status, synthetic] (the old code) ran the check
  // once against the wrong program, got null, and never re-ran → an already-activated
  // user was stranded on the Activate screen. chainResolved holds the verdict until
  // the runtime chain is known, so we never conclude against the wrong program.
  const chainResolved = !!ENV.NEXT_PUBLIC_ROME_CHAIN_ID || defaultChainId != null;
  const { provisioned, markProvisioned } = useProvisionedCheck({
    status,
    synthetic,
    programId: cfg.programId,
    chainResolved,
    connection,
  });

  // ---- position ----
  const [assetMetas, setAssetMetas] = useState<AssetMeta[]>([]);
  const emptyAssets = useMemo<SolanaAssetRead[]>(() => [], []);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  // Block-explorer base for tx links on this chain (rome-via), from the
  // registry chain.json explorerUrl. "" → ActivityFeed renders the row without
  // a working tx link rather than a broken one.
  const explorerBase = useMemo(
    () => configForChain(cfg.chainId)?.rome.explorerUrl ?? "",
    [cfg.chainId],
  );

  // Enumerate the Comet's assets once (base from cfg + collats from getAssetInfo).
  // STATIC config only (symbol/decimals/priceFeed/collateralFactor) — cached so
  // the polled refreshPosition re-reads only dynamic balances. All batched via
  // multicall: numAssets, then getAssetInfo(0..n), then symbol+decimals+feed.decimals.
  const refreshAssetMetas = useCallback(async () => {
    if (!cfg.comet || !cfg.baseAsset) return;
    const comet = cfg.comet as Address;
    const base = cfg.baseAsset as Address;
    try {
      const numAssets = Number(
        await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "numAssets" }),
      );
      const infoRes = (await evmClient.multicall({
        allowFailure: true,
        contracts: Array.from({ length: numAssets }, (_, i) => ({
          address: comet, abi: COMET_ABI, functionName: "getAssetInfo", args: [i],
        })),
      })) as readonly MCEntry[];
      const collats = infoRes
        .map((r) => (r.status === "success" ? (r.result as { asset: Address; priceFeed: Address; borrowCollateralFactor: bigint }) : null))
        .filter((x): x is { asset: Address; priceFeed: Address; borrowCollateralFactor: bigint } => x != null);

      // symbol + decimals for base & each collateral — via the SHARED helper
      // (readCometAssetSymbols) so the EVM lane and this lane label assets from
      // ONE on-chain code path. Returns base-first, in Comet order.
      const { ordered } = await readCometAssetSymbols(evmClient, comet, base);
      const symByAddr = new Map(ordered.map((o) => [o.address.toLowerCase(), o]));
      const symFor = (addr: Address): { symbol: string; decimals: number } => {
        const o = symByAddr.get(addr.toLowerCase());
        return o ? { symbol: o.symbol, decimals: o.decimals } : { symbol: addr.slice(0, 6), decimals: 8 };
      };

      // feed decimals per collateral (homogeneous PRICE_FEED_ABI batch).
      const feedDec = collats.length
        ? ((await evmClient.multicall({
            allowFailure: true,
            contracts: collats.map((c) => ({ address: c.priceFeed, abi: PRICE_FEED_ABI, functionName: "decimals" })),
          })) as readonly MCEntry[])
        : [];
      const feedDecAt = (j: number): number => {
        const v = mcResult(feedDec[j]);
        return v === undefined ? 8 : Number(v);
      };

      // Underlying SPL mint per asset (wrapper.mint_id) — base first, then collats,
      // matching the metas order. Cached on the meta so refreshPosition can read
      // the user's WALLET ATA balance (the look-ahead "spendable" source) without
      // re-deriving. Best-effort: a failed read leaves mint undefined (wallet
      // balance then falls back to the synthetic read).
      const mintAddrs: Address[] = [base, ...collats.map((c) => c.asset)];
      const mintRes = (await evmClient.multicall({
        allowFailure: true,
        contracts: mintAddrs.map((a) => ({ address: a, abi: MINT_ID_ABI, functionName: "mint_id" })),
      })) as readonly MCEntry[];
      const mintAt = (k: number): string | undefined => {
        const v = mcResult(mintRes[k]);
        return v === undefined ? undefined : new PublicKey(Buffer.from((v as Hex).slice(2), "hex")).toBase58();
      };

      const baseSym = symFor(base);
      const metas: AssetMeta[] = [
        { symbol: baseSym.symbol, address: base, isBase: true, decimals: baseSym.decimals, borrowCollateralFactorE18: 0n, mint: mintAt(0) },
        ...collats.map((c, j) => {
          const s = symFor(c.asset);
          return {
            symbol: s.symbol,
            address: c.asset,
            isBase: false,
            decimals: s.decimals,
            priceFeed: c.priceFeed,
            priceFeedDecimals: feedDecAt(j),
            borrowCollateralFactorE18: c.borrowCollateralFactor,
            mint: mintAt(j + 1),
          };
        }),
      ];
      setAssetMetas(metas);
      writeSolanaMetaCache(comet, metas); // self-invalidating by comet address
    } catch {
      // leave previous metas; next refresh retries
    }
  }, [cfg.comet, cfg.baseAsset, evmClient]);

  // Read every dynamic value for the synthetic across all assets in ONE batched
  // multicall (allowFailure), then fold into SolanaAssetRead[] + stats via the
  // unit-tested buildSolanaReadsAndStats. Static config (decimals/priceFeed/
  // collateral factor/symbol) comes from the cached assetMetas — not re-read here.
  // ---- per-user position (T0): ONE gated TanStack query in place of the 12s
  // refreshPosition setInterval. enabled once the chain RESOLVES (defaultChainId
  // from /api/env) + connected + synthetic + comet + metas — so it never reads
  // against the build-time default chain (#76 family); keyed
  // [lane,identity,chainId,programId] (no cross-lane bleed). fetchSolanaPosition
  // does the synthetic multicall ⋈ wallet-SPL join, surfacing walletUnknown on a
  // wallet-read failure (not a silent synthetic-0). ----
  const positionQuery = usePositionQuery<SolanaPositionResult>({
    lane: "sol",
    identity: synthetic ?? undefined,
    chainId: cfg.chainId,
    programId: cfg.programId,
    enabled:
      status === "connected" && chainResolved && !!synthetic && !!cfg.comet && assetMetas.length > 0,
    fetcher: () =>
      fetchSolanaPosition({
        evmClient,
        comet: cfg.comet as Address,
        synthetic: synthetic as Hex,
        assetMetas,
        connection,
        publicKey,
        basePriceUSDx8: BASE_PRICE_USDx8,
      }),
  });

  const reads = positionQuery.data?.reads ?? emptyAssets;
  const borrowCapacityUSD = positionQuery.data?.borrowCapacityUSD ?? 0;
  const healthFactor = positionQuery.data?.healthFactor ?? null;
  const limits = positionQuery.data?.limits;
  // Loaded once the first read lands OR errors (a failed read → "no position",
  // not a hang — mirrors the old setPositionLoaded(true) in the catch).
  const positionLoaded = positionQuery.data != null || positionQuery.isError;

  // Post-action / post-activate refresh = refetch the query.
  const refreshPosition = useCallback(async () => {
    await positionQuery.refetch();
  }, [positionQuery]);

  // Recent activity for the synthetic on this Comet — driven off the SAME read's
  // resolved rows (the USD lookup needs the live feed prices), re-run whenever the
  // position query data updates (retires the old in-refreshPosition fetch + poll).
  useEffect(() => {
    const resolved = positionQuery.data?.resolved;
    if (!synthetic || !cfg.comet || !resolved || resolved.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const lookup = buildActivityLookup(resolved);
        const entries = await fetchRecentActivity(evmClient, cfg.comet as Address, synthetic);
        if (!cancelled) setActivity(toLaneActivity(entries, lookup, explorerBase));
      } catch {
        // transient — keep prior activity; the next query tick re-runs this
      }
    })();
    return () => { cancelled = true; };
  }, [positionQuery.data, synthetic, cfg.comet, evmClient, explorerBase]);

  // enumerate assets when connected, then poll balances.
  useEffect(() => {
    if (status !== "connected") return;
    // Seed assetMetas from the reconnect cache so the position read can start
    // immediately (skips the ~3 sequential enumeration reads). refreshAssetMetas
    // still runs and overwrites with fresh on-chain data.
    if (cfg.comet) {
      const cached = readSolanaMetaCache(cfg.comet);
      if (cached && cached.length) setAssetMetas(cached);
    }
    void refreshAssetMetas();
  }, [status, refreshAssetMetas, cfg.comet]);

  // (position polling is the usePositionQuery refetchInterval above — no setInterval)

  const position = useMemo(
    () =>
      mapSolanaPosition({
        assets:
          reads.length > 0
            ? reads
            : // disconnected / pre-enumeration: show the asset shells so the table
              // renders. Empty SolanaAssetRead[] → empty assets; fall back to metas.
              assetMetas.map((m) => ({
                symbol: m.symbol,
                address: m.address,
                decimals: m.isBase ? 6 : 8,
                isBase: m.isBase,
                priceUSDx8: m.isBase ? BASE_PRICE_USDx8 : 0n,
                walletRaw: 0n,
                suppliedRaw: 0n,
                borrowedRaw: 0n,
                borrowCollateralFactorE18: m.borrowCollateralFactorE18,
                supplyApyPct: 0,
                borrowApyPct: 0,
              })),
        borrowCapacityUSD,
        healthFactor,
        limits,
      }),
    [reads, assetMetas, borrowCapacityUSD, healthFactor, limits],
  );

  // Token-based: a stale price feed zeroes the USD totals but the user still
  // has a real position (assets held in the synthetic's Comet account).
  const hasPosition = hasHoldings(position);

  // First position read in flight (connected but the synthetic's balances haven't
  // landed yet). LaneApp gates "loading" behind provisioned, so this is only
  // surfaced once past the Activate step. Lets the UI show "Loading…" not "No
  // position yet" on entry.
  const positionLoading = status === "connected" && !positionLoaded;

  // ---- activate + action lifecycle ----
  const [activating, setActivating] = useState(false);
  const [activateStep, setActivateStep] = useState(0);
  const [signing, setSigning] = useState(false);
  const [signStep, setSignStep] = useState(0);
  // The EXACT popup plan for the in-flight action, built from live preconditions
  // by each do* (so the count shown == what the user signs). Empty until the
  // do* reads its preconditions (LaneApp shows "Preparing…" in that brief gap).
  const [signPlan, setSignPlan] = useState<SignStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The adapter records each success itself (optimistic) — REQUIRED here, not
  // just nice-to-have: Rome doesn't surface DoTxUnsigned events via eth_getLogs,
  // so fetchRecentActivity returns nothing for this lane. These optimistic rows
  // ARE the Solana lane's activity feed; lastResult drives the success banner.
  const [optimisticActivity, setOptimisticActivity] = useState<ActivityItem[]>([]);
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);

  // Fresh-state ref so activate/submitAction stay stable callbacks (the
  // LaneAdapter contract's imperative methods are stable; mirrors useEvmLane).
  const ref = useRef({
    publicKey, signTransaction: signTx, synthetic, connection, evmClient, cfg,
    refreshPosition, refreshAssetMetas,
  });
  ref.current = {
    publicKey, signTransaction: signTx, synthetic, connection, evmClient, cfg,
    refreshPosition, refreshAssetMetas,
  };

  const clearError = useCallback(() => { setError(null); setLastResult(null); }, []);

  // ---- activate (REVISION 3: replicate discovery runActivate) ----
  const activate = useCallback(() => {
    setLastResult(null);
    void runActivate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // create_pda → ensure each asset's ATA. ACTIVATE_STEPS = 2:
  //   0→1 Create account (create_pda), 1→2 Initialize token accounts (ATAs).
  // No per-user ALT step: the lane attaches the registry's persistent comet +
  // chain ALTs (cfg.persistentAlts) to each v0 tx instead (see submitOverAlt),
  // so activation no longer creates/extends a per-user table.
  async function runActivate() {
    const r = ref.current;
    if (!r.publicKey || !r.signTransaction || !r.synthetic) {
      setError("Connect a wallet first.");
      return;
    }
    setError(null);
    setActivating(true);
    setActivateStep(0);
    const programId = new PublicKey(r.cfg.programId);
    const comet = r.cfg.comet as Address;
    const synth = r.synthetic;
    const conn = r.connection;
    try {
      // 1. synthetic external_auth PDA (idempotent — skip if it exists).
      const extAuth = externalAuthPda(programId, synth);
      if (!(await conn.getAccountInfo(extAuth))) {
        await submitCall(
          HELPER_PROGRAM,
          encodeFunctionData({ abi: CREATE_PDA_ABI, functionName: "create_pda", args: [synth] }),
        );
      }
      setActivateStep(1);

      // 2. ensure the synthetic's ATA for the base + every collateral.
      const numAssets = Number(
        await r.evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "numAssets" }),
      );
      const assetAddrs: Address[] = [r.cfg.baseAsset as Address];
      for (let i = 0; i < numAssets; i++) {
        const info = (await r.evmClient.readContract({
          address: comet,
          abi: COMET_ABI,
          functionName: "getAssetInfo",
          args: [i],
        })) as { asset: Address };
        assetAddrs.push(info.asset);
      }
      for (const a of assetAddrs) {
        const mintHex = (await r.evmClient.readContract({
          address: a,
          abi: MINT_ID_ABI,
          functionName: "mint_id",
        })) as Hex;
        const mint = new PublicKey(Buffer.from(mintHex.slice(2), "hex"));
        const ata = associatedTokenAddress(mint, extAuth, TOKEN_PROGRAM);
        if (!(await conn.getAccountInfo(ata))) {
          await submitCall(
            a,
            encodeFunctionData({ abi: ENSURE_ATA_ABI, functionName: "ensure_token_account", args: [synth] }),
          );
        }
      }
      setActivateStep(2);

      // provisioned now true; refresh state + drop the Activate screen.
      markProvisioned();
      // Confirmation banner for the one-time provisioning (no amount/sym/txUrl —
      // Activate is several signatures, not a single valued tx).
      setLastResult({ verb: "Activated account", amount: 0, sym: "" });
      await Promise.all([r.refreshAssetMetas(), r.refreshPosition()]);
      setActivating(false);
    } catch (e) {
      setActivating(false);
      setError(shortError(e));
    }
  }

  // Submit one EVM call as a DoTxUnsigned (discover → sign in Phantom → submit →
  // confirm). Mirrors discovery submitCall (sans logging); used by activate's
  // create_pda / ensure_token_account and by the simple action paths.
  async function submitCall(to: Address, data: Hex): Promise<string> {
    const r = ref.current;
    const synth = r.synthetic!;
    const pk = r.publicKey!;
    const sign = r.signTransaction!;
    const gasPrice = await r.evmClient.getGasPrice();
    const gasLimit = await estimateGasBuffered(r.evmClient, { account: synth, to, data });
    const nonce = await r.evmClient.getTransactionCount({ address: synth });
    const { signature } = await submitDoTxUnsigned(
      {
        call: { to, data },
        payer: pk,
        nonce: BigInt(nonce),
        fee: { maxFeePerGas: gasPrice, maxPriorityFeePerGas: gasPrice, gasLimit },
      },
      {
        proxyUrl: DISCOVERY_ROUTE,
        connection: r.connection,
        programId: new PublicKey(r.cfg.programId),
        chainId: r.cfg.chainId,
        signTransaction: (tx: Transaction) => sign(tx),
      },
    );
    return signature;
  }

  // Discover an EVM call's complete account list (rome_emulateCallAccounts via
  // /api/discovery) — the proxy appends treasure + balance_key, so used verbatim.
  async function discover(to: Hex, data: Hex): Promise<AccountMeta[]> {
    const r = ref.current;
    return emulateCallAccounts(DISCOVERY_ROUTE, { from: r.synthetic!, to, data }, r.publicKey!.toBase58());
  }

  // Submit one DoTx leg over the registry's PERSISTENT ALTs in a single v0 tx
  // (1 popup) — the proven supply/repay atomic path (discovery submitAtomicBundle,
  // 1 leg). The comet + chain ALTs (cfg.persistentAlts) are operator-owned and
  // shared across all users, so the lane just fetches them — no per-user ALT
  // create/extend at activation. Any account not covered by the tables is encoded
  // inline automatically by compileToV0Message.
  async function submitOverAlt(to: Hex, data: Hex, cuLimit = 1_400_000): Promise<string> {
    const r = ref.current;
    const programId = new PublicKey(r.cfg.programId);
    const synth = r.synthetic!;
    const pk = r.publicKey!;
    const sign = r.signTransaction!;
    const accounts = await discover(to, data);
    const lookupTables = await fetchPersistentAlts(r.connection, r.cfg.persistentAlts);
    const gasPrice = await r.evmClient.getGasPrice();
    const nonce = await r.evmClient.getTransactionCount({ address: synth });
    const dotxIx = buildDoTxUnsigned({
      programId,
      unsignedRlp: buildUnsignedEip1559Rlp({
        chainId: r.cfg.chainId,
        nonce: BigInt(nonce),
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice,
        gasLimit: 2_000_000n,
        to,
        data,
      }),
      accounts,
    });
    const { signature } = await submitV0Instructions(
      [...computeBudgetIxs(cuLimit), dotxIx],
      lookupTables,
      { connection: r.connection, feePayer: pk, signTransaction: (tx: VersionedTransaction) => sign(tx) },
    );
    return signature;
  }

  // ---- submitAction (stable; reads fresh state via ref, like useEvmLane) ----
  const submitAction = useCallback((input: SubmitActionInput) => {
    // Clear the prior success banner the moment a new action starts.
    setLastResult(null);
    void runAction(input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(input: SubmitActionInput) {
    const r = ref.current;
    if (!r.publicKey || !r.signTransaction || !r.synthetic) {
      setError("Connect a wallet first.");
      return;
    }
    const comet = r.cfg.comet as Address;
    const assetAddr = (input.asset.address as Address) ?? (r.cfg.baseAsset as Address);
    const decimals = input.asset.decimals ?? 6;

    // Parse amount in the asset's own units (the action panel shows token units).
    let amount: bigint;
    try {
      amount = parseTokenAmount(input.amount, decimals);
    } catch {
      setError("Enter a valid amount.");
      return;
    }
    if (amount <= 0n) {
      setError("Enter an amount greater than zero.");
      return;
    }

    setError(null);
    setSigning(true);
    setSignStep(0);
    setSignPlan([]); // each do* fills the exact plan after reading preconditions
    try {
      // Each do* returns the ACTION leg's signature (not the approve) so the
      // optimistic activity row + success banner can link to it.
      let sig: string;
      if (input.type === "supply") {
        sig = await doSupply(assetAddr, comet, amount);
      } else if (input.type === "repay") {
        sig = await doRepay(comet, amount);
      } else if (input.type === "withdraw") {
        sig = await doWithdraw(assetAddr, comet, amount);
      } else {
        sig = await doBorrow(comet, amount);
      }

      // Record the success BEFORE the on-chain refresh — and crucially, this is
      // the ONLY source of activity for the Solana lane (logs don't surface
      // DoTxUnsigned). amountUsd = token amount × the asset's USD price.
      recordSuccess(input.type, input.asset, amount, decimals, sig);

      setSigning(false);
      setSignStep(0);
      await Promise.all([r.refreshPosition(), r.refreshAssetMetas()]);
    } catch (e) {
      setSigning(false);
      setSignStep(0);
      setError(shortError(e));
    }
  }

  // Build + prepend the optimistic activity row and set the success banner for a
  // just-confirmed action. amountUsd uses the asset's USD price (same fallback
  // chain as laneActions), valuing the on-chain base-unit amount in whole tokens.
  function recordSuccess(type: ActionType, asset: SubmitActionInput["asset"], amountRaw: bigint, decimals: number, sig: string) {
    const amountTokens = Number(amountRaw) / 10 ** decimals;
    const priceUsd = assetPriceUsd(asset);
    const amountUsd = amountTokens * priceUsd;
    const txUrl = solanaExplorerTx(sig, cfg.solanaCluster);
    const entry = optimisticEntry({ type, amountUsd, sym: asset.sym, txUrl });
    setOptimisticActivity((prev) => [entry, ...prev].slice(0, 10));
    setLastResult({ verb: entry.verb, amount: amountUsd, sym: asset.sym, txUrl });
  }

  // Underlying SPL mint for a wrapper (wrapper.mint_id), as a PublicKey. Used by
  // the fund/sweep legs to derive the wallet + synthetic ATAs.
  async function mintOf(assetAddr: Address): Promise<PublicKey> {
    const r = ref.current;
    const cached = r.cfg && assetMetas.find((m) => m.address.toLowerCase() === assetAddr.toLowerCase())?.mint;
    if (cached) return new PublicKey(cached);
    const b32 = (await r.evmClient.readContract({ address: assetAddr, abi: MINT_ID_ABI, functionName: "mint_id" })) as Hex;
    return new PublicKey(Buffer.from(b32.slice(2), "hex"));
  }

  // Fund leg (wallet → synthetic): move `amount` of `mint` from the user's wallet
  // ATA into the synthetic's, so the transient synthetic has the wrapper to
  // supply/repay with (it holds nothing at rest; the faucet drops to the wallet).
  // One Phantom-signed native tx via the shared buildFundLeg.
  async function fundSyntheticFromWallet(assetAddr: Address, amount: bigint, onSign?: () => void): Promise<void> {
    const r = ref.current;
    const pk = r.publicKey!;
    const mint = await mintOf(assetAddr);
    const ixs = buildFundLeg({
      programId: new PublicKey(r.cfg.programId), chainId: r.cfg.chainId,
      mint, amount, wallet: pk, synthetic: r.synthetic!,
    });
    onSign?.(); // one Phantom popup (ensure-synthetic-ATA + transfer, bundled)
    await submitInstructions(ixs, { connection: r.connection, feePayer: pk, signTransaction: (tx: Transaction) => r.signTransaction!(tx) });
  }

  /** Does the user's wallet ATA for `assetAddr`'s mint NOT exist yet? Drives the
   *  extra "create wallet token account" popup in the sweep (and its count). */
  async function walletAtaMissing(assetAddr: Address): Promise<boolean> {
    const r = ref.current;
    const mint = await mintOf(assetAddr);
    const walletAta = associatedTokenAddress(mint, r.publicKey!, TOKEN_PROGRAM);
    return !(await r.connection.getAccountInfo(walletAta));
  }

  // Sweep leg (synthetic → wallet): push `amount` of `mint` from the synthetic's
  // ATA back to the user's own wallet ATA via HelperProgram.transfer_spl, so the
  // synthetic holds nothing at rest after a withdraw / borrow. Ensures the wallet
  // ATA first (idempotent native tx), then the transfer_spl over the ALT — the
  // deployed proxy (the Rome proxy #362) completes the transfer_spl account set, so
  // discovery returns the source+dest without manual extra accounts.
  // `needsWalletAta` is precomputed by the caller (walletAtaMissing) so the popup
  // plan + the actual popups agree exactly. `onSign` fires once per Phantom popup.
  async function sweepSyntheticToWallet(assetAddr: Address, amount: bigint, needsWalletAta: boolean, onSign?: () => void): Promise<void> {
    const r = ref.current;
    const pk = r.publicKey!;
    const mint = await mintOf(assetAddr);
    const leg = buildSweepLeg({ programId: new PublicKey(r.cfg.programId), mint, amount, wallet: pk, synthetic: r.synthetic! });
    if (needsWalletAta) {
      onSign?.();
      await submitInstructions([leg.ensureWalletAtaIx], { connection: r.connection, feePayer: pk, signTransaction: (tx: Transaction) => r.signTransaction!(tx) });
    }
    onSign?.();
    await submitOverAlt(leg.helperTo, leg.calldata);
  }

  // supply: fund wallet→synthetic → approve (only if allowance < amount) → supply
  // over the ALT → confirm. The synthetic-transient model: the wrapper comes from
  // the WALLET, is supplied to Comet, and the synthetic nets to zero. The exact
  // popup count (2 without approve, 3 with) is read up-front so the plan matches.
  async function doSupply(assetAddr: Address, comet: Address, amount: bigint): Promise<string> {
    const r = ref.current;
    const synth = r.synthetic!;
    const allowance = (await r.evmClient.readContract({
      address: assetAddr, abi: erc20Abi, functionName: "allowance", args: [synth, comet],
    })) as bigint;
    const needsApprove = allowance < amount;
    setSignPlan(signSteps("sol", "supply", { needsApprove }));
    let step = 0;
    const next = () => setSignStep(step++);
    await fundSyntheticFromWallet(assetAddr, amount, next);                 // ① fund
    if (needsApprove) { next(); await submitCall(assetAddr, encodeApprove(comet, amount)); } // ② approve
    next();                                                                 // ③ supply
    const sig = await submitOverAlt(comet as Hex, encodeFunctionData({ abi: COMET_ABI, functionName: "supply", args: [assetAddr, amount] }));
    setSignStep(step);                                                      // confirm
    return sig;
  }

  // repay = supply(base) toward debt. Same fund → approve(if needed) → repay shape.
  async function doRepay(comet: Address, amount: bigint): Promise<string> {
    const r = ref.current;
    const synth = r.synthetic!;
    const base = r.cfg.baseAsset as Address;
    const allowance = (await r.evmClient.readContract({
      address: base, abi: erc20Abi, functionName: "allowance", args: [synth, comet],
    })) as bigint;
    const needsApprove = allowance < amount;
    setSignPlan(signSteps("sol", "repay", { needsApprove }));
    let step = 0;
    const next = () => setSignStep(step++);
    await fundSyntheticFromWallet(base, amount, next);                      // ① fund
    if (needsApprove) { next(); await submitCall(base, encodeApprove(comet, amount)); } // ② approve
    next();                                                                 // ③ repay
    const sig = await submitOverAlt(comet as Hex, encodeRepay(base, amount));
    setSignStep(step);
    return sig;
  }

  // withdraw → sweep synthetic→wallet (so nothing is stranded). The withdraw is a
  // heavy v0 tx over the ALT; the sweep is 1 popup (or 2 when the wallet ATA must
  // be created). Read that up-front so the plan shows the exact count.
  async function doWithdraw(assetAddr: Address, comet: Address, amount: bigint): Promise<string> {
    const needsWalletAta = await walletAtaMissing(assetAddr);
    setSignPlan(signSteps("sol", "withdraw", { needsWalletAta }));
    let step = 0;
    const next = () => setSignStep(step++);
    next();                                                                 // ① withdraw
    const data = encodeFunctionData({ abi: COMET_ABI, functionName: "withdraw", args: [assetAddr, amount] });
    const sig = await submitOverAlt(comet as Hex, data);
    await sweepSyntheticToWallet(assetAddr, amount, needsWalletAta, next);  // ② (+create-ATA?) return to wallet
    setSignStep(step);                                                      // confirm
    return sig;
  }

  // borrow = withdraw(base, supply + amount) → opens `amount` of debt, then sweeps
  // the borrowed base synthetic→wallet. Same shape as withdraw (action + sweep).
  async function doBorrow(comet: Address, amount: bigint): Promise<string> {
    const r = ref.current;
    const synth = r.synthetic!;
    const base = r.cfg.baseAsset as Address;
    const needsWalletAta = await walletAtaMissing(base);
    setSignPlan(signSteps("sol", "borrow", { needsWalletAta }));
    let step = 0;
    const next = () => setSignStep(step++);
    const baseSupply = (await r.evmClient.readContract({
      address: comet, abi: COMET_ABI, functionName: "balanceOf", args: [synth],
    })) as bigint;
    const withdrawAmount = baseSupply + amount; // drain supply first, then open debt
    next();                                                                 // ① authorize borrow
    const data = encodeFunctionData({ abi: COMET_ABI, functionName: "withdraw", args: [base, withdrawAmount] });
    const sig = await submitOverAlt(comet as Hex, data);
    await sweepSyntheticToWallet(base, amount, needsWalletAta, next);       // ② (+create-ATA?) send to wallet
    setSignStep(step);                                                      // confirm
    return sig;
  }

  // ---- connect / disconnect ----
  // connect delegates to the shared robust helper (race-free reconnect); the
  // lane only adds its own state resets on disconnect.
  const connectFn = connectWallet;

  const disconnectFn = useCallback(() => {
    disconnectWallet();
    setSigning(false);
    setSignStep(0);
    setActivating(false);
    setActivateStep(0);
    setError(null);
    setLastResult(null);
    setOptimisticActivity([]);
  }, [disconnectWallet]);

  // Optimistic rows (first) + the fetched feed (empty for this lane — Rome
  // doesn't surface DoTxUnsigned via logs), de-duped + capped. So in practice
  // the activity feed IS the optimistic list here.
  const mergedActivity = useMemo(
    () => mergeActivity(optimisticActivity, activity),
    [optimisticActivity, activity],
  );

  return {
    chain: "sol",
    wallets: ["Phantom", "Solflare", "Backpack"],

    connection: {
      status,
      // Display the user's OWN Solana address (Phantom pubkey) — that's what a
      // Solana-native user recognises. The synthetic EVM address (keccak(pubkey)
      // [12:]) is still the on-chain identity used internally for reads + txs, but
      // it's an implementation detail the user shouldn't have to see.
      address: status === "connected" && publicKey ? publicKey.toBase58() : undefined,
      wallet: wallet?.adapter.name,
    },
    connect: connectFn,
    disconnect: disconnectFn,

    // provisioned is already gated inside useProvisionedCheck (true until the
    // on-chain check concludes), so a brand-new user sees a brief loading/empty
    // screen rather than a false-Activate flash, and an activated user is never
    // stranded on Activate after a refresh.
    provisioned,
    activating,
    activateStep,
    activate,

    position,
    hasPosition,
    positionLoading,
    // Optimistic rows merged with the (empty) fetched feed — see mergedActivity.
    activity: mergedActivity,

    submitAction,
    signing,
    signStep,
    signPlan,

    error,
    clearError,
    lastResult,
  };
}

// --- helpers (pure-ish; no hooks) ---

/** Build the per-asset {sym, decimals, price} lookup the activity mapper needs,
 *  from the resolved per-asset reads. Keyed by "base" (the Comet base asset) or
 *  a lowercased collateral address — matching ActivityEntry.asset. Pure. */
function buildActivityLookup(resolved: SolanaAssetResolved[]): AssetLookup {
  const byAddr = new Map<string, { sym: string; decimals: number; priceUSDx8: bigint }>();
  let base: { sym: string; decimals: number; priceUSDx8: bigint } | undefined;
  for (const r of resolved) {
    const info = { sym: r.symbol, decimals: r.decimals, priceUSDx8: r.priceUSDx8 };
    byAddr.set(r.address.toLowerCase(), info);
    if (r.isBase) base = info;
  }
  return (asset: "base" | string) =>
    asset === "base" ? base : byAddr.get(asset.toLowerCase());
}

/** Whole-token USD price for an asset — same fallback chain as laneActions'
 *  priceOf (asset.priceUsd, then the USD/token wallet pair, then $1). Values the
 *  optimistic activity row in USD. Pure. */
function assetPriceUsd(asset: { priceUsd?: number; walletTokens: number; walletBal: number }): number {
  if (asset.priceUsd && asset.priceUsd > 0) return asset.priceUsd;
  if (asset.walletTokens > 0 && asset.walletBal > 0) return asset.walletBal / asset.walletTokens;
  return 1;
}

/** Parse a decimal token amount string into base units, rejecting garbage. */
function parseTokenAmount(input: string, decimals: number): bigint {
  const s = (input || "").trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") throw new Error("invalid");
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

/** Normalise a Chainlink-compatible feed answer to a 1e8-scaled USD price given
 *  the feed's own decimals. Pure — the latestRoundData + feed.decimals reads are
 *  batched in the multicall; this just rescales. */
function shortError(e: unknown): string {
  const anyE = e as { shortMessage?: string; message?: string } | undefined;
  const raw = anyE?.shortMessage || anyE?.message || "Transaction failed";
  if (/user rejected|denied|rejected the request|reject|cancell?ed/i.test(raw)) {
    return "A signature was rejected in your wallet.";
  }
  // On-chain reverts carry the rome-evm logs after a newline — keep the first line.
  return raw.split("\n")[0].slice(0, 160);
}
