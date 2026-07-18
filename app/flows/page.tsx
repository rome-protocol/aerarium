"use client";

// Solana-native Compound FLOW HARNESS — proves each money-market flow on the
// CORRECTED model before wiring the production app:
//   - DoTxUnsigned (synthetic = derive_sender(Solana signer); no sponsor/adapter)
//   - tx submitted to Solana DIRECTLY from the browser (proxy = discovery only)
//   - synthetic holds NOTHING at rest: assets live in the user's wallet or Comet
//   - every action shows its steps, what each does, and the PRE-COMPUTED number
//     of Phantom signatures (read from live state, so it's honest)
//   - a synthetic CHECK + SWEEP: see anything stranded in the synthetic and
//     send it back to the wallet (or finish it into Comet)
//
// This slice ships the scaffold + synthetic-check + sweep. Sweep exercises
// `transfer_spl → wallet ATA`, the linchpin outbound primitive that withdraw /
// borrow reuse — so proving sweep proves the riskiest mechanic first.
//
// Run: a #353 proxy on :9090 (rome_emulateCallAccounts) reachable via
// DISCOVERY_PROXY_UPSTREAM; Phantom on Solana devnet with a little SOL.

import "@solana/wallet-adapter-react-ui/styles.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  type AccountMeta,
} from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import {
  createPublicClient,
  http,
  defineChain,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  type Address,
  type Hex,
} from "viem";

import { syntheticAddress } from "@/lib/solana/identity";
import {
  submitInstructions,
  submitV0Instructions,
  computeBudgetIxs,
  treasureWallet,
  externalAuthPda,
  balanceKeyPda,
  associatedTokenAddress,
} from "@/lib/solana/submit";
import { ensureAlt } from "@/lib/solana/alt";
import { readAltPointer } from "@/lib/solana/altRegistry";
import { buildDoTxUnsigned, buildActivateAtaInstruction } from "@/lib/solana/instructions";
import { buildUnsignedEip1559Rlp } from "@/lib/solana/unsignedTx";
import { emulateCallAccounts } from "@/lib/solana/discovery";
import { encodeApprove, encodeAbsorb, encodeBuyCollateral } from "@/lib/solana/cometCalldata";
import { resolveProbeConfig, solanaRpcEndpoint } from "@/lib/solana/probeConfig";
import { solanaExplorerTx } from "@/lib/solana/explorer";
import { isFlowsEnabled } from "@/lib/flowsGate";
import { readWalletSplBalances } from "@/lib/solana/syntheticTransientFlows";
import { availableFor } from "@/lib/lane/laneActions";
import type { LaneAsset, LanePosition, ActionType } from "@/components/aerarium/lane/types";
import { notFound } from "next/navigation";
import { discoveryAssets } from "@/lib/discoveryAssets";
import { DEFAULT_CHAIN_CONFIG_RAW } from "@/lib/config";

// resolveProbeConfig reads NEXT_PUBLIC_* — Next inlines these at build; mirror
// the discovery page's ENV snapshot so config resolves identically.
const ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_ROME_CHAIN_ID: process.env.NEXT_PUBLIC_ROME_CHAIN_ID,
  NEXT_PUBLIC_ROME_EVM_PROGRAM: process.env.NEXT_PUBLIC_ROME_EVM_PROGRAM,
  NEXT_PUBLIC_COMET_PROXY: process.env.NEXT_PUBLIC_COMET_PROXY,
  NEXT_PUBLIC_UNIFIED_TOKEN: process.env.NEXT_PUBLIC_UNIFIED_TOKEN,
  NEXT_PUBLIC_SOLANA_CLUSTER: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
  NEXT_PUBLIC_SOLANA_RPC: process.env.NEXT_PUBLIC_SOLANA_RPC,
  NEXT_PUBLIC_DISCOVERY_PROXY_URL: process.env.NEXT_PUBLIC_DISCOVERY_PROXY_URL,
};

const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");
// Native BPF faucet — one `claim` (tag 0) drops ALL faucet tokens to the
// connected wallet in ONE Solana tx (create user ATA + transfer from the reserve
// PDA, per mint). No EVM VM → ~few-K CU/token vs ~220K for SelfServeFaucet.claim.
const NATIVE_FAUCET = new PublicKey("541ZWNGfvw7ZurRRgQAEs1i3UEAFff7HUEL69oV4jeoW");
const HELPER_PROGRAM = "0xff00000000000000000000000000000000000009" as const;

// Comet assets (base + collaterals) derived from the ACTIVE chain's registry
// config — chain-agnostic, follows NEXT_PUBLIC_DEFAULT_CHAIN_ID. amount = 1
// whole token per asset (scaled by each asset's decimals).
const ASSETS = discoveryAssets(DEFAULT_CHAIN_CONFIG_RAW);

// Wrapper exposes its underlying SPL mint via mint_id() (bytes32). Plus erc20.
const WRAPPER_ABI = [
  ...erc20Abi,
  { type: "function", name: "mint_id", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bytes32" }] },
] as const;

// IHelperProgram.transfer_spl(bytes32 to_ata, uint64 tokens, bytes32 mint) —
// moves the CALLER's (synthetic's) SPL to a caller-supplied destination ATA.
const HELPER_TRANSFER_SPL_ABI = [
  { type: "function", name: "transfer_spl", stateMutability: "nonpayable", inputs: [{ name: "to_ata", type: "bytes32" }, { name: "tokens", type: "uint64" }, { name: "mint", type: "bytes32" }], outputs: [] },
] as const;

// Faucet tokens dropped by the native BPF faucet's `claim` (one tx, one sig) —
// the chain's provisioned faucet set, sourced from the registry (faucet.tokens),
// so it follows the active chain. They land directly in the connected Phantom
// wallet's ATAs; the synthetic is NOT involved.
const FAUCET_TOKENS: { symbol: string; address: Address }[] =
  (DEFAULT_CHAIN_CONFIG_RAW.faucet?.tokens ?? []).map((t) => ({
    symbol: t.symbol,
    address: t.address as Address,
  }));
// HelperProgram.create_pda(user) — create the synthetic's external_auth PDA.
const CREATE_PDA_ABI = [
  { type: "function", name: "create_pda", stateMutability: "nonpayable", inputs: [{ name: "user", type: "address" }], outputs: [] },
] as const;
// wrapper.ensure_token_account(user) — init the synthetic's ATA for that mint.
const ENSURE_ATA_ABI = [
  { type: "function", name: "ensure_token_account", stateMutability: "nonpayable", inputs: [{ name: "user", type: "address" }], outputs: [] },
] as const;

const COMET_ABI = [
  { type: "function", name: "supply", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "borrowBalanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "collateralBalanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }, { name: "asset", type: "address" }], outputs: [{ type: "uint128" }] },
  { type: "function", name: "isLiquidatable", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "baseToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "numAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function", name: "getAssetInfo", stateMutability: "view",
    inputs: [{ name: "i", type: "uint8" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "offset", type: "uint8" },
        { name: "asset", type: "address" },
        { name: "priceFeed", type: "address" },
        { name: "scale", type: "uint64" },
        { name: "borrowCollateralFactor", type: "uint64" },
        { name: "liquidateCollateralFactor", type: "uint64" },
        { name: "liquidationFactor", type: "uint64" },
        { name: "supplyCap", type: "uint128" },
      ],
    }],
  },
] as const;

function pubkeyToBytes32(pk: PublicKey): Hex {
  return `0x${Buffer.from(pk.toBytes()).toString("hex")}`;
}

// ── A discovered + finalized DoTxUnsigned, submitted direct to Solana ──
// Discovers the account set for `synthetic → to(data)`, appends the treasure
// (gas) wallet + any caller-supplied extras discovery can't surface (e.g. a
// transfer_spl destination ATA), builds the DoTxUnsigned, and submits one
// Phantom-signed Solana tx. Returns the signature.
async function runDoTxUnsigned(opts: {
  cfg: ReturnType<typeof resolveProbeConfig>;
  connection: Connection;
  evmClient: ReturnType<typeof createPublicClient>;
  walletPubkey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  synthetic: Hex;
  to: Hex;
  data: Hex;
  extraAccounts?: AccountMeta[];
  prependIxs?: TransactionInstruction[];
  cuLimit?: number;
  log?: (s: string) => void;
}): Promise<string> {
  const { cfg, connection, evmClient, walletPubkey, signTransaction, synthetic, to, data } = opts;
  const programId = new PublicKey(cfg.programId);

  const accounts = await emulateCallAccounts(cfg.proxyUrl, { from: synthetic, to, data }, walletPubkey.toBase58());

  // Discovery (eth_estimate_gas) omits the treasure (gas/fee) wallet the
  // DoTxUnsigned execution pays — append it (index 0 is reliable).
  const treasure = treasureWallet(programId, cfg.chainId, 0);
  if (!accounts.some((a) => a.pubkey.equals(treasure))) {
    accounts.push({ pubkey: treasure, isSigner: false, isWritable: true });
  }
  // Append caller-supplied accounts discovery can't surface (deduped).
  for (const extra of opts.extraAccounts ?? []) {
    if (!accounts.some((a) => a.pubkey.equals(extra.pubkey))) accounts.push(extra);
  }

  const gasPrice = await evmClient.getGasPrice();
  const nonce = await evmClient.getTransactionCount({ address: synthetic });
  const unsignedRlp = buildUnsignedEip1559Rlp({
    chainId: cfg.chainId,
    nonce: BigInt(nonce),
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice,
    gasLimit: 2_000_000n,
    to,
    data,
  });
  const dotxIx = buildDoTxUnsigned({ programId, unsignedRlp, accounts });
  const ixs = [...computeBudgetIxs(opts.cuLimit ?? 1_350_000), ...(opts.prependIxs ?? []), dotxIx];
  // Heavy flows (borrow/liquidate touch ~30 accounts via isBorrowCollateralized's
  // oracle batch) overflow a legacy tx (>1232B) — route them over a v0 tx + ALT
  // (accounts referenced by 1-byte index). Light flows (~12) stay legacy.
  if (accounts.length > 18) {
    const alt = await ensureAlt(
      accounts.map((a) => a.pubkey),
      { connection, payer: walletPubkey, signTransaction },
      `${synthetic}-${cfg.comet}`,
      opts.log,
    );
    const { signature } = await submitV0Instructions(ixs, [alt], {
      connection,
      feePayer: walletPubkey,
      signTransaction: signTransaction as unknown as (tx: VersionedTransaction) => Promise<VersionedTransaction>,
    });
    return signature;
  }
  const { signature } = await submitInstructions(ixs, { connection, feePayer: walletPubkey, signTransaction });
  return signature;
}

// An asset the harness can act on. The sweep only needs symbol+address; ASSETS
// entries (which also carry a default `amount`) satisfy this structurally.
type AssetRef = { symbol: string; address: Address };
type Stranded = { asset: AssetRef; amount: bigint; decimals: number; mint: PublicKey };
type CometAssetMeta = { asset: AssetRef; decimals: number; mint: PublicKey };

function FlowHarness() {
  const cfg = useMemo(() => resolveProbeConfig(ENV), []);
  const solanaRpcUrl = useMemo(
    () => solanaRpcEndpoint(cfg.solanaRpc, typeof window !== "undefined" ? window.location.origin : ""),
    [cfg.solanaRpc],
  );
  const { publicKey, signTransaction } = useWallet();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [stranded, setStranded] = useState<Stranded[] | null>(null);
  const [position, setPosition] = useState<{ base: { symbol: string; supply: bigint; debt: bigint; decimals: number }; collaterals: { symbol: string; amount: bigint; decimals: number }[] } | null>(null);
  const [absorbTarget, setAbsorbTarget] = useState("");
  const [result, setResult] = useState<Record<string, { ok?: boolean; text: string }>>({});

  const append = useCallback((s: string) => {
    setLog((l) => [...l, `${new Date().toISOString().slice(11, 19)}  ${s}`]);
  }, []);

  const setRes = useCallback(
    (key: string, text: string, ok?: boolean) => setResult((r) => ({ ...r, [key]: { ok, text } })),
    [],
  );

  const synthetic = useMemo(
    () => (publicKey ? syntheticAddress(publicKey) : null),
    [publicKey],
  );

  const evmClient = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const chain = defineChain({
      id: cfg.chainId,
      name: "Rome",
      nativeCurrency: { name: "gas", symbol: "GAS", decimals: 18 },
      rpcUrls: { default: { http: [`${origin}/api/rome-rpc`] } },
    });
    return createPublicClient({ chain, transport: http(`${origin}/api/rome-rpc`) });
  }, [cfg.chainId]);

  // ── Enumerate EVERY comet asset from chain (base token + all collaterals),
  // cached per session. The synthetic check/sweep MUST cover the full set, not a
  // hardcoded subset — a stranded balance in any collateral would otherwise be
  // missed and unrecoverable. Static per comet, so read once and reuse. ──
  const cometAssetsRef = useRef<CometAssetMeta[] | null>(null);
  const loadCometAssets = useCallback(async (): Promise<CometAssetMeta[]> => {
    if (cometAssetsRef.current) return cometAssetsRef.current;
    const comet = cfg.comet as Address;
    const [base, numAssets] = await Promise.all([
      evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "baseToken" }) as Promise<Address>,
      evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "numAssets" }) as Promise<number>,
    ]);
    const infos = await Promise.all(
      Array.from({ length: Number(numAssets) }, (_, i) =>
        evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "getAssetInfo", args: [i] }) as Promise<{ asset: Address }>,
      ),
    );
    // base first, then each collateral; dedupe by address (base is not a collateral, but be safe).
    const seen = new Set<string>();
    const addrs = [base, ...infos.map((x) => x.asset)].filter((a) => {
      const k = a.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const metas = await Promise.all(
      addrs.map(async (address) => {
        const [symbol, decimals, mintB32] = await Promise.all([
          evmClient.readContract({ address, abi: WRAPPER_ABI, functionName: "symbol" }) as Promise<string>,
          evmClient.readContract({ address, abi: WRAPPER_ABI, functionName: "decimals" }) as Promise<number>,
          evmClient.readContract({ address, abi: WRAPPER_ABI, functionName: "mint_id" }) as Promise<Hex>,
        ]);
        return { asset: { symbol, address }, decimals, mint: new PublicKey(Buffer.from(mintB32.slice(2), "hex")) };
      }),
    );
    cometAssetsRef.current = metas;
    return metas;
  }, [cfg, evmClient]);

  // ── Synthetic CHECK: enumerate the synthetic PDA's ACTUAL token accounts
  // (getParsedTokenAccountsByOwner), not a comet-asset whitelist. A position
  // token emitted by Comet (e.g. cWUSDC on supply) lives in an ATA OUTSIDE the
  // 9 comet assets, so the old whitelist scan was structurally blind to it.
  // Known comet-asset mints get a friendly symbol; everything else is surfaced
  // as a position/receipt token. Anything non-zero is strandable → sweepable. ──
  const checkSynthetic = useCallback(async () => {
    if (!synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      append(`── checking synthetic ${synthetic} for stranded assets ──`);
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const synthPda = externalAuthPda(new PublicKey(cfg.programId), synthetic);
      const assets = await loadCometAssets();
      const known = new Map(assets.map((a) => [a.mint.toBase58(), a]));
      const resp = await connection.getParsedTokenAccountsByOwner(synthPda, { programId: TOKEN_PROGRAM });
      append(`  scanning ${resp.value.length} ATAs owned by synthetic PDA (${assets.length} known comet assets + others)`);
      const found: Stranded[] = [];
      for (const { account } of resp.value) {
        const info = (account.data as { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } }).parsed.info;
        const raw = BigInt(info.tokenAmount.amount);
        if (raw === 0n) continue;
        const mint = new PublicKey(info.mint);
        const meta = known.get(mint.toBase58());
        const symbol = meta ? meta.asset.symbol : `${info.mint.slice(0, 4)}…${info.mint.slice(-4)}`;
        const decimals = meta ? meta.decimals : info.tokenAmount.decimals;
        const address = meta ? meta.asset.address : ("0x0000000000000000000000000000000000000000" as Address);
        found.push({ asset: { symbol, address }, amount: raw, decimals, mint });
        append(`  ⚠️  ${formatUnits(raw, decimals)} ${symbol} lying in synthetic${meta ? "" : "  (non-comet-asset — position/receipt token)"}`);
      }
      if (!found.length) append("  ✓ synthetic is clean — nothing stranded");
      setStranded(found);
    } catch (e) {
      append(`check FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [synthetic, solanaRpcUrl, cfg, append, loadCometAssets]);

  // ── Your Comet POSITION: read the synthetic's actual money-market position on
  // the comet — base supply (balanceOf), base debt (borrowBalanceOf), and each
  // collateral's deposit (collateralBalanceOf). All reads are for `synthetic`.
  // loadCometAssets returns base FIRST, then collaterals. ──
  const loadPosition = useCallback(async () => {
    if (!synthetic) return;
    setBusy(true);
    try {
      const comet = cfg.comet as Address;
      const assets = await loadCometAssets();
      const base = assets[0];
      const [supply, debt] = await Promise.all([
        evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "balanceOf", args: [synthetic] }) as Promise<bigint>,
        evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "borrowBalanceOf", args: [synthetic] }) as Promise<bigint>,
      ]);
      const collaterals = await Promise.all(
        assets.slice(1).map(async (c) => ({
          symbol: c.asset.symbol,
          amount: (await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "collateralBalanceOf", args: [synthetic, c.asset.address] })) as bigint,
          decimals: c.decimals,
        })),
      );
      setPosition({ base: { symbol: base.asset.symbol, supply, debt, decimals: base.decimals }, collaterals });
    } catch (e) {
      append(`position read FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [synthetic, cfg, evmClient, append, loadCometAssets]);

  // Auto-load the synthetic's Comet position on connect (and whenever it changes).
  useEffect(() => {
    if (synthetic) void loadPosition();
  }, [synthetic, loadPosition]);

  // ── LOOK-AHEAD: "available to {supply,withdraw,borrow,repay}" per comet asset,
  // sourcing the spendable WALLET balance from the user's Solana wallet ATA
  // (readWalletSplBalances) — NOT the synthetic (≈0 at rest). Runs the SHARED
  // availableFor model. Prints per asset so you can eyeball available-to-supply
  // against your actual Phantom holdings — proving the wallet-aware sourcing. ──
  const doLookahead = useCallback(async () => {
    if (!synthetic || !publicKey) return append("connect Phantom first");
    setBusy(true);
    setRes("lookahead", "running…");
    try {
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const comet = cfg.comet as Address;
      const assets = await loadCometAssets(); // base first, then collaterals
      const baseDec = assets[0].decimals;
      const FEED_ABI = [
        { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [{ name: "roundId", type: "uint80" }, { name: "answer", type: "int256" }, { name: "startedAt", type: "uint256" }, { name: "updatedAt", type: "uint256" }, { name: "answeredInRound", type: "uint80" }] },
        { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
      ] as const;
      const MKT_ABI = [
        { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "totalBorrow", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
        { type: "function", name: "baseBorrowMin", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
      ] as const;

      // 1. WALLET balances (the fix) — each asset's underlying mint, owned by Phantom.
      const walletRaw = await readWalletSplBalances(connection, publicKey, assets.map((a) => a.mint), TOKEN_PROGRAM);

      // 2. Comet position + market (synthetic-keyed — the on-chain identity).
      const [baseSupply, baseDebt, totalSupply, totalBorrow, baseBorrowMin] = await Promise.all([
        evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "balanceOf", args: [synthetic] }) as Promise<bigint>,
        evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "borrowBalanceOf", args: [synthetic] }) as Promise<bigint>,
        evmClient.readContract({ address: comet, abi: MKT_ABI, functionName: "totalSupply" }) as Promise<bigint>,
        evmClient.readContract({ address: comet, abi: MKT_ABI, functionName: "totalBorrow" }) as Promise<bigint>,
        (evmClient.readContract({ address: comet, abi: MKT_ABI, functionName: "baseBorrowMin" }) as Promise<bigint>).catch(() => 0n),
      ]);

      // 3. Collateral deposits + capacity (Σ collateral tokens × price × CF).
      const suppliedRaw: bigint[] = [baseSupply];
      const priceUsd: number[] = [1]; // base ≈ $1
      const collFactor: number[] = [0]; // base contributes no capacity (CF 0)
      let capacityUsd = 0;
      for (let i = 1; i < assets.length; i++) {
        const a = assets[i];
        const [bal, info] = await Promise.all([
          evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "collateralBalanceOf", args: [synthetic, a.asset.address] }) as Promise<bigint>,
          evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "getAssetInfo", args: [i - 1] }) as Promise<{ priceFeed: Address; borrowCollateralFactor: bigint }>,
        ]);
        suppliedRaw.push(bal);
        let price = 0;
        try {
          const [rd, fd] = await Promise.all([
            evmClient.readContract({ address: info.priceFeed, abi: FEED_ABI, functionName: "latestRoundData" }) as Promise<readonly [bigint, bigint, bigint, bigint, bigint]>,
            evmClient.readContract({ address: info.priceFeed, abi: FEED_ABI, functionName: "decimals" }) as Promise<number>,
          ]);
          price = Number(rd[1]) / 10 ** Number(fd);
        } catch { price = 0; }
        priceUsd.push(price);
        const cf = Number(info.borrowCollateralFactor) / 1e18;
        collFactor.push(cf);
        capacityUsd += (Number(bal) / 10 ** a.decimals) * price * cf;
      }

      const position: LanePosition = {
        supplied: Number(baseSupply) / 10 ** baseDec,
        borrowed: Number(baseDebt) / 10 ** baseDec,
        capacity: capacityUsd,
        healthFactor: 0,
        netApr: 0,
        assets: [],
        limits: {
          availableLiquidityUsd: Math.max(0, Number(totalSupply - totalBorrow) / 10 ** baseDec),
          baseBorrowMinUsd: Number(baseBorrowMin) / 10 ** baseDec,
        },
      };

      append("── LOOK-AHEAD (available per action; wallet-sourced) ──");
      const lines: string[] = [];
      assets.forEach((a, i) => {
        const isBase = i === 0;
        const dec = a.decimals;
        const walletTokens = Number(walletRaw[i]) / 10 ** dec;
        const suppliedTokens = Number(suppliedRaw[i]) / 10 ** dec;
        const borrowedTokens = isBase ? Number(baseDebt) / 10 ** dec : 0;
        const asset: LaneAsset = {
          sym: a.asset.symbol, name: a.asset.symbol, supplyApy: 0, borrowApy: 0, borrowable: isBase,
          walletBal: walletTokens * priceUsd[i], suppliedBal: suppliedTokens * priceUsd[i], borrowedBal: borrowedTokens,
          walletTokens, suppliedTokens, borrowedTokens, priceUsd: priceUsd[i], collateral: !isBase,
          borrowCollateralFactor: collFactor[i],
        };
        const fmt = (t: ActionType) => {
          const r = availableFor({ type: t, asset, position });
          return `${r.tokens.toFixed(4)} (${r.binding})`;
        };
        const acts = [`supply ${fmt("supply")}`];
        if (isBase) acts.push(`borrow ${fmt("borrow")}`, `repay ${fmt("repay")}`);
        acts.push(`withdraw ${fmt("withdraw")}`);
        const line = `  ${a.asset.symbol.padEnd(10)} wallet=${walletTokens} supplied=${suppliedTokens}${isBase ? ` debt=${borrowedTokens}` : ""} → ${acts.join(" · ")}`;
        append(line);
        lines.push(line);
      });
      setRes("lookahead", `✓ wallet-sourced look-ahead — compare 'supply' vs your wallet balance:\n${lines.join("\n")}`, true);
    } catch (e) {
      append(`look-ahead FAILED: ${(e as Error).message}`);
      setRes("lookahead", `✗ ${(e as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  }, [synthetic, publicKey, solanaRpcUrl, cfg, evmClient, append, setRes, loadCometAssets]);

  // ── SWEEP → wallet: synthetic pushes its stranded wrapper SPL back to the
  // user's own wallet ATA via HelperProgram.transfer_spl(walletAta, amt, mint).
  // 1 Phantom signature. ──
  const sweepToWallet = useCallback(async (s: Stranded) => {
    if (!synthetic || !publicKey || !signTransaction) return append("connect Phantom first");
    setBusy(true);
    try {
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const walletAta = associatedTokenAddress(s.mint, publicKey, TOKEN_PROGRAM);
      // Source = the synthetic's own ATA for this mint (owned by its external-auth
      // PDA). Discovery truncates transfer_spl's source when the dest doesn't exist
      // yet, so derive + append it explicitly — the on-chain program only sees keys.
      const synthAta = associatedTokenAddress(
        s.mint, externalAuthPda(new PublicKey(cfg.programId), synthetic), TOKEN_PROGRAM,
      );
      // Ensure the user's wallet ATA exists — transfer_spl reverts ("destination
      // ata not owned by SPL-program") if it was never created. Idempotent: a
      // no-op if it already exists. Native ix, wallet-signed, same 1-sig bundle.
      const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        publicKey, walletAta, publicKey, s.mint, TOKEN_PROGRAM,
      );
      // Create the dest ATA in a SEPARATE confirmed tx FIRST when it's missing.
      // Discovery (emulateCallAccounts) emulates transfer_spl against on-chain
      // state; if the dest doesn't exist the emulation aborts early and TRUNCATES
      // the account set (drops source ATA + authority PDA), so the on-chain DoTx
      // then reverts "account not found". With the dest pre-created, discovery
      // returns the full set — same as for assets whose wallet ATA already exists.
      if (!(await connection.getAccountInfo(walletAta))) {
        append(`creating ${s.asset.symbol} wallet ATA (1 of 2)…`);
        await submitInstructions([createAtaIx], { connection, feePayer: publicKey, signTransaction });
        append(`  ✓ ATA created`);
      }
      const data = encodeFunctionData({
        abi: HELPER_TRANSFER_SPL_ABI,
        functionName: "transfer_spl",
        args: [pubkeyToBytes32(walletAta), s.amount, pubkeyToBytes32(s.mint)],
      });
      append(`sweep ${formatUnits(s.amount, s.decimals)} ${s.asset.symbol} → wallet (ensure ATA + transfer_spl)…`);
      const sig = await runDoTxUnsigned({
        cfg, connection, evmClient, walletPubkey: publicKey, signTransaction,
        synthetic, to: HELPER_PROGRAM, data,
        // dest ATA pre-created above so discovery returns the full set; keep the
        // explicit source+dest appends as a harmless backstop (deduped vs discovery)
        extraAccounts: [
          { pubkey: walletAta, isSigner: false, isWritable: true }, // dest (your wallet)
          { pubkey: synthAta, isSigner: false, isWritable: true },  // source (synthetic)
        ],
      });
      append(`  ✓ swept · sig=${sig} ${solanaExplorerTx(sig, cfg.solanaCluster)}`);
      await checkSynthetic();
    } catch (e) {
      append(`sweep FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [synthetic, publicKey, signTransaction, solanaRpcUrl, cfg, evmClient, append, checkSynthetic]);

  // ── SWEEP → Comet: finish a stranded balance into Comet (supply). Needs the
  // synthetic to have approved comet (standing approve from setup); if not, this
  // surfaces the missing-approve so the user knows it's 2 sigs. ──
  const sweepToComet = useCallback(async (s: Stranded) => {
    if (!synthetic || !publicKey || !signTransaction) return append("connect Phantom first");
    setBusy(true);
    try {
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const comet = cfg.comet as Address;
      const allowance = await evmClient.readContract({
        address: s.asset.address, abi: erc20Abi, functionName: "allowance", args: [synthetic, comet],
      }) as bigint;
      if (allowance < s.amount) {
        append(`approve ${s.asset.symbol} → comet (1 of 2)…`);
        await runDoTxUnsigned({
          cfg, connection, evmClient, walletPubkey: publicKey, signTransaction,
          synthetic, to: s.asset.address, data: encodeApprove(comet, s.amount),
        });
      }
      append(`supply ${formatUnits(s.amount, s.decimals)} ${s.asset.symbol} → comet…`);
      const data = encodeFunctionData({ abi: COMET_ABI, functionName: "supply", args: [s.asset.address, s.amount] });
      const sig = await runDoTxUnsigned({
        cfg, connection, evmClient, walletPubkey: publicKey, signTransaction,
        synthetic, to: comet, data, cuLimit: 1_400_000,
      });
      append(`  ✓ supplied · sig=${sig} ${solanaExplorerTx(sig, cfg.solanaCluster)}`);
      await checkSynthetic();
    } catch (e) {
      append(`finish-to-comet FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [synthetic, publicKey, signTransaction, solanaRpcUrl, cfg, evmClient, append, checkSynthetic]);

  // ── ⓪ ACTIVATE USER (one-time): create_pda → ensure synthetic ATAs → create &
  // store the ALT (reused by every later action). Idempotent — safe to re-run.
  // Replicates lib/lane/useSolanaLane runActivate (PDA → ATA → ALT). ──
  const doActivate = useCallback(async () => {
    if (!synthetic || !publicKey || !signTransaction) return append("connect Phantom first");
    setBusy(true);
    setRes("activate", "running…");
    try {
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const programId = new PublicKey(cfg.programId);
      const comet = cfg.comet as Address;
      const extAuth = externalAuthPda(programId, synthetic);
      append(`── activate ${synthetic} (one-time: PDA → ATAs → ALT) ──`);

      // Fast path: PDA + a stored ALT both present ⟹ already activated. Report it
      // clearly (NO Phantom popup is needed — nothing to sign) and skip the slow
      // re-derivation, so a re-click on an activated wallet isn't a silent no-op.
      const existingAlt = await readAltPointer(connection, publicKey, comet);
      if (existingAlt && (await connection.getAccountInfo(extAuth))) {
        append(`  ✓ already activated — PDA + ALT (${existingAlt.toBase58().slice(0, 8)}…) present. Nothing to sign; you can airdrop + run flows.`);
        setRes("activate", `✓ already activated — PDA + ALT (${existingAlt.toBase58().slice(0, 8)}…) present`, true);
        return;
      }

      // 1. synthetic external_auth PDA (skip if it already exists)
      if (!(await connection.getAccountInfo(extAuth))) {
        append("  ① create synthetic PDA (create_pda)");
        await runDoTxUnsigned({ cfg, connection, evmClient, walletPubkey: publicKey, signTransaction, synthetic, to: HELPER_PROGRAM, data: encodeFunctionData({ abi: CREATE_PDA_ABI, functionName: "create_pda", args: [synthetic] }) });
      } else append("  ① synthetic PDA already exists");

      // 2. ensure the synthetic's ATA for base + every collateral
      const numAssets = Number(await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "numAssets" }));
      const assetAddrs: Address[] = [cfg.baseAsset as Address];
      for (let i = 0; i < numAssets; i++) {
        const info = (await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "getAssetInfo", args: [i] })) as { asset: Address };
        if (!assetAddrs.some((x) => x.toLowerCase() === info.asset.toLowerCase())) assetAddrs.push(info.asset);
      }
      append(`  ② ensure synthetic ATAs for ${assetAddrs.length} assets`);
      const ataPubkeys: PublicKey[] = [];
      for (const a of assetAddrs) {
        const mintHex = (await evmClient.readContract({ address: a, abi: WRAPPER_ABI, functionName: "mint_id" })) as Hex;
        const mint = new PublicKey(Buffer.from(mintHex.slice(2), "hex"));
        const ata = associatedTokenAddress(mint, extAuth, TOKEN_PROGRAM);
        ataPubkeys.push(ata);
        if (!(await connection.getAccountInfo(ata))) {
          await runDoTxUnsigned({ cfg, connection, evmClient, walletPubkey: publicKey, signTransaction, synthetic, to: a, data: encodeFunctionData({ abi: ENSURE_ATA_ABI, functionName: "ensure_token_account", args: [synthetic] }) });
        }
      }

      // 3. build + store the shared per-comet ALT (reused by every action)
      append("  ③ create & store ALT (alt-registry)");
      const allAccts = new Map<string, PublicKey>();
      for (const a of assetAddrs) {
        const data = encodeFunctionData({ abi: COMET_ABI, functionName: "supply", args: [a, 0n] });
        const accts = await emulateCallAccounts(cfg.proxyUrl, { from: synthetic, to: comet, data }, publicKey.toBase58());
        for (const x of accts) allAccts.set(x.pubkey.toBase58(), x.pubkey);
      }
      for (const ata of ataPubkeys) allAccts.set(ata.toBase58(), ata);
      for (const k of [treasureWallet(programId, cfg.chainId, 0), balanceKeyPda(programId, cfg.chainId, synthetic)]) allAccts.set(k.toBase58(), k);
      const alt = await ensureAlt([...allAccts.values()], { connection, payer: publicKey, signTransaction }, `${synthetic}-${comet}`, append);
      append(`  ✓ activated · ALT ${alt.key.toBase58()} (${alt.state.addresses.length} keys) — reused by every flow`);
      setRes("activate", `✓ activated · ALT ${alt.key.toBase58()} (${alt.state.addresses.length} keys)`, true);
    } catch (e) {
      append(`activate FAILED: ${(e as Error).message}`);
      setRes("activate", `✗ ${(e as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  }, [synthetic, publicKey, signTransaction, solanaRpcUrl, cfg, evmClient, append, setRes]);

  // ── AIRDROP: native BPF faucet → YOUR Phantom wallet. ONE Solana tx (one
  // Phantom signature) drops ALL faucet tokens at once: `claim` (tag 0) creates
  // each user ATA and transfers the configured amount from the reserve PDA. The
  // synthetic is NOT involved — funds land where the supply flow pulls from.
  // 23 accounts (5 fixed + 3/token) fits a legacy tx — no ALT needed. ──
  const doAirdrop = useCallback(async () => {
    if (!synthetic || !publicKey || !signTransaction) return append("connect Phantom first");
    setBusy(true);
    setRes("airdrop", "running…");
    try {
      const connection = new Connection(solanaRpcUrl, "confirmed");
      append(`── airdrop ${FAUCET_TOKENS.length} test tokens → your wallet ${publicKey.toBase58().slice(0, 8)}… (1 signature, one transaction) ──`);
      const reserveAuth = PublicKey.findProgramAddressSync([Buffer.from("reserve")], NATIVE_FAUCET)[0];
      // Fixed prefix: recipient/fee-payer, reserve authority PDA, then the
      // programs the faucet CPIs into (token, ATA, system).
      const keys: AccountMeta[] = [
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: reserveAuth, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: ATA_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      ];
      // Per faucet token: mint (ro), reserve ATA (source, rw), wallet ATA (dest, rw).
      // associatedTokenAddress is curve-agnostic so it derives the PDA-owned reserve ATA too.
      for (const t of FAUCET_TOKENS) {
        const mintHex = (await evmClient.readContract({ address: t.address, abi: WRAPPER_ABI, functionName: "mint_id" })) as Hex;
        const mint = new PublicKey(Buffer.from(mintHex.slice(2), "hex"));
        keys.push({ pubkey: mint, isSigner: false, isWritable: false });
        keys.push({ pubkey: associatedTokenAddress(mint, reserveAuth, TOKEN_PROGRAM), isSigner: false, isWritable: true });
        keys.push({ pubkey: associatedTokenAddress(mint, publicKey, TOKEN_PROGRAM), isSigner: false, isWritable: true });
      }
      append(`  claim(tag 0) — ${keys.length} accounts, all ${FAUCET_TOKENS.length} tokens in one tx`);
      const claimIx = new TransactionInstruction({ programId: NATIVE_FAUCET, keys, data: Buffer.from([0]) });
      const { signature: sig } = await submitInstructions(
        [ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), claimIx],
        { connection, feePayer: publicKey, signTransaction },
      );
      append(`  ✓ airdropped ${FAUCET_TOKENS.length} token(s) to your wallet · sig=${sig} ${solanaExplorerTx(sig, cfg.solanaCluster)} — supply them below`);
      setRes("airdrop", `✓ airdropped ${FAUCET_TOKENS.length} token(s) to your wallet in 1 tx · sig=${sig}`, true);
      await checkSynthetic();
    } catch (e) {
      append(`airdrop FAILED: ${(e as Error).message}`);
      setRes("airdrop", `✗ ${(e as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  }, [synthetic, publicKey, signTransaction, solanaRpcUrl, cfg, evmClient, append, checkSynthetic, setRes]);

  // ── SUPPLY: wallet → Comet, synthetic as transient. Steps:
  //   ① fund: ensure synthetic ATA + ActivateAta (wallet→synthetic), one tx
  //   ② approve synthetic→comet (only if live allowance < amount)
  //   ③ comet.supply (synthetic→comet) — synthetic nets to zero
  // Sig count is read from live allowance (2 or 3) and shown before acting. ──
  const doSupply = useCallback(async (asset: (typeof ASSETS)[number], resKey: string = "supply") => {
    if (!synthetic || !publicKey || !signTransaction) return append("connect Phantom first");
    setBusy(true);
    setRes(resKey, "running…");
    try {
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const programId = new PublicKey(cfg.programId);
      const comet = cfg.comet as Address;
      const amount = asset.amount;
      const [mintB32, decimals, allowance] = await Promise.all([
        evmClient.readContract({ address: asset.address, abi: WRAPPER_ABI, functionName: "mint_id" }) as Promise<Hex>,
        evmClient.readContract({ address: asset.address, abi: WRAPPER_ABI, functionName: "decimals" }) as Promise<number>,
        evmClient.readContract({ address: asset.address, abi: erc20Abi, functionName: "allowance", args: [synthetic, comet] }) as Promise<bigint>,
      ]);
      const mint = new PublicKey(Buffer.from(mintB32.slice(2), "hex"));
      const synthPda = externalAuthPda(programId, synthetic);
      const walletAta = associatedTokenAddress(mint, publicKey, TOKEN_PROGRAM);
      const synthAta = associatedTokenAddress(mint, synthPda, TOKEN_PROGRAM);
      const needApprove = allowance < amount;
      append(`── supply ${formatUnits(amount, decimals)} ${asset.symbol} → ${needApprove ? 3 : 2} signatures ──`);

      // ① fund: ensure synthetic ATA + move wallet→synthetic (ActivateAta), one tx
      append(`  ① fund: ${asset.symbol} wallet → synthetic`);
      const ensureSynthAta = createAssociatedTokenAccountIdempotentInstruction(publicKey, synthAta, synthPda, mint, TOKEN_PROGRAM);
      const activateIx = buildActivateAtaInstruction({ programId, chainId: cfg.chainId, mint, tokens: amount, signer: publicKey, fromAta: walletAta, toAta: synthAta, tokenProgram: TOKEN_PROGRAM });
      await submitInstructions([ensureSynthAta, activateIx], { connection, feePayer: publicKey, signTransaction });

      // ② approve (only if live allowance is short)
      if (needApprove) {
        append(`  ② approve ${asset.symbol} → comet`);
        await runDoTxUnsigned({ cfg, connection, evmClient, walletPubkey: publicKey, signTransaction, synthetic, to: asset.address, data: encodeApprove(comet, amount) });
      }

      // ③ supply synthetic → comet
      append(`  ${needApprove ? "③" : "②"} supply ${asset.symbol} → comet`);
      const supplyData = encodeFunctionData({ abi: COMET_ABI, functionName: "supply", args: [asset.address, amount] });
      const sig = await runDoTxUnsigned({ cfg, connection, evmClient, walletPubkey: publicKey, signTransaction, synthetic, to: comet, data: supplyData, cuLimit: 1_400_000 });
      append(`  ✓ supplied · sig=${sig} ${solanaExplorerTx(sig, cfg.solanaCluster)}`);
      setRes(resKey, `✓ supplied ${formatUnits(amount, decimals)} ${asset.symbol} · sig=${sig}`, true);
      await checkSynthetic();
    } catch (e) {
      append(`supply FAILED: ${(e as Error).message}`);
      setRes(resKey, `✗ ${(e as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  }, [synthetic, publicKey, signTransaction, solanaRpcUrl, cfg, evmClient, append, checkSynthetic, setRes]);

  // ── WITHDRAW: Comet → wallet, synthetic transient (mirror of supply). Steps:
  //   ① comet.withdraw (Comet→synthetic's wrapper ATA)
  //   ② transfer_spl (synthetic→wallet) — the proven sweep primitive
  // 2 sigs; synthetic nets to zero. ──
  const doWithdraw = useCallback(async (asset: (typeof ASSETS)[number]) => {
    if (!synthetic || !publicKey || !signTransaction) return append("connect Phantom first");
    setBusy(true);
    setRes("withdraw", "running…");
    try {
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const programId = new PublicKey(cfg.programId);
      const comet = cfg.comet as Address;
      // Drawdown only: cap at the ACTUAL position. Compound rounds supply down via
      // present-value indexing (e.g. 1.0 → 0.999974), so requesting the full 1.0
      // would treat the shortfall as an uncollateralized BORROW and revert. Base
      // position = balanceOf; collateral position = collateralBalanceOf.
      const isBase = asset.address.toLowerCase() === String(cfg.baseAsset).toLowerCase();
      const available = (isBase
        ? await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "balanceOf", args: [synthetic] })
        : await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "collateralBalanceOf", args: [synthetic, asset.address] })) as bigint;
      const amount = asset.amount < available ? asset.amount : available;
      const [mintB32, decimals] = await Promise.all([
        evmClient.readContract({ address: asset.address, abi: WRAPPER_ABI, functionName: "mint_id" }) as Promise<Hex>,
        evmClient.readContract({ address: asset.address, abi: WRAPPER_ABI, functionName: "decimals" }) as Promise<number>,
      ]);
      const mint = new PublicKey(Buffer.from(mintB32.slice(2), "hex"));
      const synthPda = externalAuthPda(programId, synthetic);
      const walletAta = associatedTokenAddress(mint, publicKey, TOKEN_PROGRAM);
      const synthAta = associatedTokenAddress(mint, synthPda, TOKEN_PROGRAM);
      if (amount === 0n) {
        append(`  nothing to withdraw — your ${asset.symbol} position is 0`);
        setRes("withdraw", `nothing to withdraw — ${asset.symbol} position is 0`, false);
        return;
      }
      append(`── withdraw ${formatUnits(amount, decimals)} ${asset.symbol} (capped to position) → 2 signatures ──`);

      // ① comet.withdraw → synthetic's wrapper ATA
      append(`  ① withdraw ${asset.symbol}: comet → synthetic`);
      const withdrawData = encodeFunctionData({ abi: COMET_ABI, functionName: "withdraw", args: [asset.address, amount] });
      await runDoTxUnsigned({ cfg, connection, evmClient, walletPubkey: publicKey, signTransaction, synthetic, to: comet, data: withdrawData, cuLimit: 1_400_000 });

      // ② transfer_spl synthetic → wallet (the proven sweep primitive)
      append(`  ② return ${asset.symbol}: synthetic → wallet`);
      if (!(await connection.getAccountInfo(walletAta))) {
        const ensureWalletAta = createAssociatedTokenAccountIdempotentInstruction(publicKey, walletAta, publicKey, mint, TOKEN_PROGRAM);
        await submitInstructions([ensureWalletAta], { connection, feePayer: publicKey, signTransaction });
      }
      const transferData = encodeFunctionData({ abi: HELPER_TRANSFER_SPL_ABI, functionName: "transfer_spl", args: [pubkeyToBytes32(walletAta), amount, pubkeyToBytes32(mint)] });
      const sig = await runDoTxUnsigned({
        cfg, connection, evmClient, walletPubkey: publicKey, signTransaction,
        synthetic, to: HELPER_PROGRAM, data: transferData,
        extraAccounts: [
          { pubkey: walletAta, isSigner: false, isWritable: true },
          { pubkey: synthAta, isSigner: false, isWritable: true },
        ],
      });
      append(`  ✓ withdrawn · sig=${sig} ${solanaExplorerTx(sig, cfg.solanaCluster)}`);
      setRes("withdraw", `✓ withdrawn ${formatUnits(amount, decimals)} ${asset.symbol} → wallet · sig=${sig}`, true);
      await checkSynthetic();
    } catch (e) {
      append(`withdraw FAILED: ${(e as Error).message}`);
      setRes("withdraw", `✗ ${(e as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  }, [synthetic, publicKey, signTransaction, solanaRpcUrl, cfg, evmClient, append, checkSynthetic, setRes]);

  // ── BORROW: withdraw base BEYOND supply → opens debt, return to wallet. Same
  // 2-sig shape as withdraw. Requires collateral in the synthetic's Comet acct
  // (supply a collateral first). ⚠️ borrow triggers isBorrowCollateralized's
  // oracle batch — may approach the 1.4M CU ceiling with many collaterals. ──
  const doBorrow = useCallback(async () => {
    if (!synthetic || !publicKey || !signTransaction) return append("connect Phantom first");
    setBusy(true);
    setRes("borrow", "running…");
    try {
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const programId = new PublicKey(cfg.programId);
      const comet = cfg.comet as Address;
      const base = (cfg.baseAsset || ASSETS[0].address) as Address;
      const borrowAmount = 1_000_000n;
      const [mintB32, decimals, baseSupply] = await Promise.all([
        evmClient.readContract({ address: base, abi: WRAPPER_ABI, functionName: "mint_id" }) as Promise<Hex>,
        evmClient.readContract({ address: base, abi: WRAPPER_ABI, functionName: "decimals" }) as Promise<number>,
        evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "balanceOf", args: [synthetic] }) as Promise<bigint>,
      ]);
      const mint = new PublicKey(Buffer.from(mintB32.slice(2), "hex"));
      const synthPda = externalAuthPda(programId, synthetic);
      const walletAta = associatedTokenAddress(mint, publicKey, TOKEN_PROGRAM);
      const synthAta = associatedTokenAddress(mint, synthPda, TOKEN_PROGRAM);
      const withdrawAmount = baseSupply + borrowAmount; // drain any base supply + open borrowAmount of debt
      append(`── borrow ${formatUnits(borrowAmount, decimals)} base (drains ${formatUnits(baseSupply, decimals)} supply + opens debt) → 2 signatures ──`);
      append(`  ① withdraw base beyond supply (opens debt): comet → synthetic`);
      const withdrawData = encodeFunctionData({ abi: COMET_ABI, functionName: "withdraw", args: [base, withdrawAmount] });
      await runDoTxUnsigned({ cfg, connection, evmClient, walletPubkey: publicKey, signTransaction, synthetic, to: comet, data: withdrawData, cuLimit: 1_400_000, log: append });
      append(`  ② return base: synthetic → wallet`);
      if (!(await connection.getAccountInfo(walletAta))) {
        await submitInstructions([createAssociatedTokenAccountIdempotentInstruction(publicKey, walletAta, publicKey, mint, TOKEN_PROGRAM)], { connection, feePayer: publicKey, signTransaction });
      }
      const transferData = encodeFunctionData({ abi: HELPER_TRANSFER_SPL_ABI, functionName: "transfer_spl", args: [pubkeyToBytes32(walletAta), withdrawAmount, pubkeyToBytes32(mint)] });
      const sig = await runDoTxUnsigned({
        cfg, connection, evmClient, walletPubkey: publicKey, signTransaction, synthetic, to: HELPER_PROGRAM, data: transferData,
        extraAccounts: [{ pubkey: walletAta, isSigner: false, isWritable: true }, { pubkey: synthAta, isSigner: false, isWritable: true }],
      });
      const debt = await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "borrowBalanceOf", args: [synthetic] }) as bigint;
      append(`  ✓ borrowed · debt now ${formatUnits(debt, decimals)} · sig=${sig} ${solanaExplorerTx(sig, cfg.solanaCluster)}`);
      setRes("borrow", `✓ borrowed · debt now ${formatUnits(debt, decimals)} · sig=${sig}`, true);
      await checkSynthetic();
    } catch (e) {
      append(`borrow FAILED: ${(e as Error).message}`);
      setRes("borrow", `✗ ${(e as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  }, [synthetic, publicKey, signTransaction, solanaRpcUrl, cfg, evmClient, append, checkSynthetic, setRes]);

  // ── LIQUIDATE / ABSORB: the synthetic (as absorber) absorbs an underwater
  // account — seizes its collateral to the protocol + clears its debt.
  // Permissionless, no funds/approve → 1 signature. absorb runs the target's FULL
  // collateral oracle batch, so it's heavy (>18 accounts → v0+ALT, handled inside
  // runDoTxUnsigned). Discovery of underwater accounts is deferred to the indexer
  // (the eth_getLogs/legibility gap); here the target is entered manually. ──
  const doAbsorb = useCallback(async (targetRaw: string) => {
    if (!synthetic || !publicKey || !signTransaction) return append("connect Phantom first");
    const target = targetRaw.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(target)) return append("enter a valid 0x target address");
    setBusy(true);
    setRes("absorb", "running…");
    try {
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const comet = cfg.comet as Address;
      // Pre-check: absorb reverts if the target isn't liquidatable — don't waste a sig.
      const liq = (await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "isLiquidatable", args: [target as Address] })) as boolean;
      append(`── absorb ${target} → 1 signature ──`);
      if (!liq) {
        append(`  ✗ target is NOT liquidatable (isLiquidatable=false) — absorb would revert. Aborting.`);
        setRes("absorb", "✗ target is NOT liquidatable (isLiquidatable=false) — aborted, no sig spent", false);
        return;
      }
      append(`  ① absorb(synthetic, [target]): seizes collateral + clears debt`);
      const data = encodeAbsorb(synthetic, [target as Address]);
      const sig = await runDoTxUnsigned({ cfg, connection, evmClient, walletPubkey: publicKey, signTransaction, synthetic, to: comet, data, cuLimit: 1_400_000, log: append });
      const debtAfter = (await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "borrowBalanceOf", args: [target as Address] })) as bigint;
      append(`  ✓ absorbed · target debt now ${debtAfter} · sig=${sig} ${solanaExplorerTx(sig, cfg.solanaCluster)}`);
      setRes("absorb", `✓ absorbed · target debt now ${debtAfter} · sig=${sig}`, true);
    } catch (e) {
      append(`absorb FAILED: ${(e as Error).message}`);
      setRes("absorb", `✗ ${(e as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  }, [synthetic, publicKey, signTransaction, solanaRpcUrl, cfg, evmClient, append, setRes]);

  // ── BUY COLLATERAL: the liquidator's reward leg. The synthetic buys seized
  // collateral from the protocol reserves at the storefront discount, paying
  // `baseAmount` of base. Synthetic-transient: ① fund base wallet→synthetic ·
  // ② approve base→comet (if short) · ③ buyCollateral(recipient=synthetic) ·
  // ④ transfer_spl the received collateral→wallet. Synthetic nets to zero. ──
  const doBuyCollateral = useCallback(async (collateral: (typeof ASSETS)[number], baseAmount: bigint) => {
    if (!synthetic || !publicKey || !signTransaction) return append("connect Phantom first");
    setBusy(true);
    setRes("buy", "running…");
    try {
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const programId = new PublicKey(cfg.programId);
      const comet = cfg.comet as Address;
      const base = (cfg.baseAsset || ASSETS[0].address) as Address;
      const [baseMintB32, baseDecimals, baseAllowance, collMintB32, collDecimals] = await Promise.all([
        evmClient.readContract({ address: base, abi: WRAPPER_ABI, functionName: "mint_id" }) as Promise<Hex>,
        evmClient.readContract({ address: base, abi: WRAPPER_ABI, functionName: "decimals" }) as Promise<number>,
        evmClient.readContract({ address: base, abi: erc20Abi, functionName: "allowance", args: [synthetic, comet] }) as Promise<bigint>,
        evmClient.readContract({ address: collateral.address, abi: WRAPPER_ABI, functionName: "mint_id" }) as Promise<Hex>,
        evmClient.readContract({ address: collateral.address, abi: WRAPPER_ABI, functionName: "decimals" }) as Promise<number>,
      ]);
      const baseMint = new PublicKey(Buffer.from(baseMintB32.slice(2), "hex"));
      const collMint = new PublicKey(Buffer.from(collMintB32.slice(2), "hex"));
      const synthPda = externalAuthPda(programId, synthetic);
      const baseWalletAta = associatedTokenAddress(baseMint, publicKey, TOKEN_PROGRAM);
      const baseSynthAta = associatedTokenAddress(baseMint, synthPda, TOKEN_PROGRAM);
      const collWalletAta = associatedTokenAddress(collMint, publicKey, TOKEN_PROGRAM);
      const collSynthAta = associatedTokenAddress(collMint, synthPda, TOKEN_PROGRAM);
      const needApprove = baseAllowance < baseAmount;
      append(`── buy ${collateral.symbol} collateral for ${formatUnits(baseAmount, baseDecimals)} base → ${needApprove ? 4 : 3} signatures ──`);

      append(`  ① fund base: wallet → synthetic`);
      const ensureBaseSynthAta = createAssociatedTokenAccountIdempotentInstruction(publicKey, baseSynthAta, synthPda, baseMint, TOKEN_PROGRAM);
      const activateIx = buildActivateAtaInstruction({ programId, chainId: cfg.chainId, mint: baseMint, tokens: baseAmount, signer: publicKey, fromAta: baseWalletAta, toAta: baseSynthAta, tokenProgram: TOKEN_PROGRAM });
      await submitInstructions([ensureBaseSynthAta, activateIx], { connection, feePayer: publicKey, signTransaction });

      if (needApprove) {
        append(`  ② approve base → comet`);
        await runDoTxUnsigned({ cfg, connection, evmClient, walletPubkey: publicKey, signTransaction, synthetic, to: base, data: encodeApprove(comet, baseAmount) });
      }

      // minAmount=0: no slippage floor — fine for the harness (we want it to land);
      // production would quote via comet.quoteCollateral and pass a floor.
      append(`  ${needApprove ? "③" : "②"} buyCollateral: synthetic spends base, receives ${collateral.symbol}`);
      const buyData = encodeBuyCollateral(collateral.address, 0n, baseAmount, synthetic);
      await runDoTxUnsigned({ cfg, connection, evmClient, walletPubkey: publicKey, signTransaction, synthetic, to: comet, data: buyData, cuLimit: 1_400_000, log: append });

      const recvd = (await evmClient.readContract({ address: collateral.address, abi: WRAPPER_ABI, functionName: "balanceOf", args: [synthetic] })) as bigint;
      append(`  ${needApprove ? "④" : "③"} return ${formatUnits(recvd, collDecimals)} ${collateral.symbol}: synthetic → wallet`);
      if (!(await connection.getAccountInfo(collWalletAta))) {
        await submitInstructions([createAssociatedTokenAccountIdempotentInstruction(publicKey, collWalletAta, publicKey, collMint, TOKEN_PROGRAM)], { connection, feePayer: publicKey, signTransaction });
      }
      const transferData = encodeFunctionData({ abi: HELPER_TRANSFER_SPL_ABI, functionName: "transfer_spl", args: [pubkeyToBytes32(collWalletAta), recvd, pubkeyToBytes32(collMint)] });
      const sig = await runDoTxUnsigned({
        cfg, connection, evmClient, walletPubkey: publicKey, signTransaction, synthetic, to: HELPER_PROGRAM, data: transferData,
        extraAccounts: [{ pubkey: collWalletAta, isSigner: false, isWritable: true }, { pubkey: collSynthAta, isSigner: false, isWritable: true }],
      });
      append(`  ✓ bought + returned ${collateral.symbol} · sig=${sig} ${solanaExplorerTx(sig, cfg.solanaCluster)}`);
      setRes("buy", `✓ bought + returned ${formatUnits(recvd, collDecimals)} ${collateral.symbol} → wallet · sig=${sig}`, true);
      await checkSynthetic();
    } catch (e) {
      append(`buyCollateral FAILED: ${(e as Error).message}`);
      setRes("buy", `✗ ${(e as Error).message}`, false);
    } finally {
      setBusy(false);
    }
  }, [synthetic, publicKey, signTransaction, solanaRpcUrl, cfg, evmClient, append, checkSynthetic, setRes]);

  // REPAY = supply(base) toward debt (Comet v3: supply(base) repays the borrow
  // first, surplus becomes supply). Reuses the supply flow on the base asset.
  const baseAssetObj = ASSETS.find((a) => a.address.toLowerCase() === String(cfg.baseAsset).toLowerCase()) ?? ASSETS[0];
  const collateralAssets = ASSETS.filter((a) => a.address.toLowerCase() !== String(cfg.baseAsset).toLowerCase());

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: 24, fontFamily: "ui-monospace, monospace", color: "#222" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Solana-native Compound — flow harness</h1>
      <p style={{ fontSize: 13, color: "#666" }}>
        DoTxUnsigned · direct-to-Solana · synthetic holds nothing at rest. Each flow shows its steps + the
        pre-computed number of Phantom signatures.
      </p>
      <div style={{ margin: "12px 0" }}><WalletMultiButton /></div>
      {synthetic && (
        <div style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>
          synthetic EVM address: <code>{synthetic}</code>
          <div>comet: <code>{cfg.comet}</code> · chain {cfg.chainId} · cluster {cfg.solanaCluster}</div>
        </div>
      )}

      <Section title="⓪ Activate user (one-time: PDA → ATAs → ALT)">
        <p style={{ fontSize: 12, color: "#666" }}>
          One-time setup for a new wallet: create the synthetic&apos;s PDA, init its token accounts, then
          create + store the Address Lookup Table (reused by every later flow). Idempotent — safe to re-run.
        </p>
        <button style={btn(true, busy || !synthetic)} disabled={busy || !synthetic} onClick={doActivate}>Activate user</button>
        <ResultBox r={result["activate"]} />
      </Section>

      <Section title="Airdrop test funds → your Phantom wallet (1 signature)">
        <p style={{ fontSize: 12, color: "#666" }}>
          Drops all {FAUCET_TOKENS.length} test collateral tokens straight into YOUR Phantom wallet in
          <b> one transaction (1 signature)</b> via the native faucet program — the synthetic is not involved.
          Then supply them below.
        </p>
        <button style={btn(true, busy || !synthetic)} disabled={busy || !synthetic} onClick={doAirdrop}>Airdrop {FAUCET_TOKENS.length} tokens (1 sig)</button>
        <ResultBox r={result["airdrop"]} />
      </Section>

      <Section title="① Check the synthetic (anything lying around?)">
        <p style={{ fontSize: 12, color: "#666" }}>Reads every comet asset's wrapper balance on the synthetic. Anything &gt; 0 is stranded and should be swept.</p>
        <button style={btn(true, busy || !synthetic)} disabled={busy || !synthetic} onClick={checkSynthetic}>Check synthetic</button>
        {stranded && stranded.length > 0 && (
          <table style={{ marginTop: 12, fontSize: 13, width: "100%" }}>
            <tbody>
              {stranded.map((s) => (
                <tr key={s.asset.symbol}>
                  <td>⚠️ {formatUnits(s.amount, s.decimals)} {s.asset.symbol}</td>
                  <td style={{ textAlign: "right" }}>
                    <button style={btn(true, busy)} disabled={busy} onClick={() => sweepToWallet(s)}>Return to wallet (1 sig)</button>{" "}
                    <button style={btn(false, busy)} disabled={busy} onClick={() => sweepToComet(s)}>Supply to Comet</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {stranded && stranded.length === 0 && <p style={{ fontSize: 13, color: "#15803d" }}>✓ synthetic is clean.</p>}
      </Section>

      <Section title="Your Comet position">
        <p style={{ fontSize: 12, color: "#666" }}>
          The synthetic&apos;s actual money-market position on the comet: base supply, base debt, and each
          collateral deposit. Auto-loads on connect; refresh after any flow.
        </p>
        <button style={btn(true, busy || !synthetic)} disabled={busy || !synthetic} onClick={loadPosition}>Refresh position</button>
        {position && (
          <table style={{ marginTop: 12, fontSize: 13, width: "100%" }}>
            <tbody>
              <tr>
                <td>Supplied {position.base.symbol}</td>
                <td style={{ textAlign: "right" }}>{formatUnits(position.base.supply, position.base.decimals)}</td>
              </tr>
              <tr>
                <td>Borrowed {position.base.symbol}</td>
                <td style={{ textAlign: "right" }}>{formatUnits(position.base.debt, position.base.decimals)}</td>
              </tr>
              {position.collaterals.map((c) => (
                <tr key={c.symbol}>
                  <td>{c.symbol}</td>
                  <td style={{ textAlign: "right" }}>{formatUnits(c.amount, c.decimals)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="① Look-ahead — available per action (wallet-sourced)">
        <p style={{ fontSize: 12, color: "#666" }}>
          Computes &quot;available to supply / withdraw / borrow / repay&quot; per comet asset via the shared
          availableFor model, sourcing the spendable balance from your <strong>Solana wallet</strong> ATA
          (not the synthetic, which is ~0 at rest). Compare the printed <em>supply</em> available against your
          actual wallet holdings — if they match, the wallet-aware sourcing is proven.
        </p>
        <button style={btn(true, busy || !synthetic)} disabled={busy || !synthetic} onClick={doLookahead}>
          Compute look-ahead
        </button>
        <ResultBox r={result["lookahead"]} />
      </Section>

      <Section title="② Supply (wallet → Comet, synthetic transient)">
        <p style={{ fontSize: 12, color: "#666" }}>
          ① fund synthetic from your wallet (ActivateAta) · ② approve (only if live allowance is short) · ③ comet.supply.
          Synthetic nets to zero. The header line shows the pre-computed signature count read from on-chain allowance.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ASSETS.map((a) => (
            <button key={a.symbol} style={btn(true, busy || !synthetic)} disabled={busy || !synthetic} onClick={() => doSupply(a)}>
              Supply {a.symbol}
            </button>
          ))}
        </div>
        <ResultBox r={result["supply"]} />
      </Section>

      <Section title="③ Withdraw (Comet → wallet, synthetic transient)">
        <p style={{ fontSize: 12, color: "#666" }}>
          ① comet.withdraw (Comet→synthetic) · ② transfer_spl (synthetic→your wallet). 2 sigs; synthetic nets to zero.
          Requires an existing supply/collateral position in the asset (supply it first).
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ASSETS.map((a) => (
            <button key={a.symbol} style={btn(false, busy || !synthetic)} disabled={busy || !synthetic} onClick={() => doWithdraw(a)}>
              Withdraw {a.symbol}
            </button>
          ))}
        </div>
        <ResultBox r={result["withdraw"]} />
      </Section>

      <Section title="④ Borrow / Repay (base, against collateral)">
        <p style={{ fontSize: 12, color: "#666" }}>
          <b>Borrow</b> = withdraw base beyond supply → opens debt → returns to wallet (2 sigs). <b>Needs collateral supplied first</b>
          (Supply wETH/wSOL/wBTC above). ⚠️ borrow runs the oracle batch — may approach the 1.4M CU ceiling with many collaterals.
          <b> Repay</b> = supply base toward debt (reuses ① fund + ③ supply).
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn(false, busy || !synthetic)} disabled={busy || !synthetic} onClick={() => doBorrow()}>Borrow base (wUSDC)</button>
          <button style={btn(false, busy || !synthetic)} disabled={busy || !synthetic} onClick={() => doSupply(baseAssetObj, "repay")}>Repay base (supply wUSDC)</button>
        </div>
        <ResultBox r={result["borrow"]} />
        <ResultBox r={result["repay"]} />
      </Section>

      <Section title="⑤ Liquidate / absorb (synthetic as liquidator)">
        <p style={{ fontSize: 12, color: "#666" }}>
          <b>Absorb</b> = synthetic absorbs an underwater account: seizes its collateral to the protocol + clears its debt
          (1 sig; runs the target&apos;s full collateral oracle batch → v0+ALT). Auto-discovery of underwater accounts is
          deferred to the indexer (the Solana-native log gap), so enter the known underwater address. The flow pre-checks
          <code>isLiquidatable</code> and aborts (no wasted sig) if the target isn&apos;t underwater yet.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={absorbTarget}
            onChange={(e) => setAbsorbTarget(e.target.value)}
            placeholder="0x underwater target (e.g. your synthetic once SOL dips)"
            spellCheck={false}
            style={{ flex: 1, minWidth: 280, padding: "8px 10px", fontSize: 12, fontFamily: "ui-monospace, monospace", border: "1px solid #999", borderRadius: 8 }}
          />
          <button style={btn(true, busy || !synthetic)} disabled={busy || !synthetic} onClick={() => doAbsorb(absorbTarget)}>Absorb (1 sig)</button>
          <button style={btn(false, busy || !synthetic)} disabled={busy || !synthetic} onClick={() => setAbsorbTarget(synthetic ?? "")}>Use my synthetic</button>
        </div>
        <ResultBox r={result["absorb"]} />
        <p style={{ fontSize: 12, color: "#666", marginTop: 12 }}>
          <b>Buy collateral</b> = the reward leg. Synthetic buys the seized collateral from reserves with base, then forwards
          it to your wallet (① fund base · ② approve · ③ buyCollateral · ④ transfer_spl→wallet; 3–4 sigs). Synthetic nets to zero.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {collateralAssets.map((a) => (
            <button key={a.symbol} style={btn(false, busy || !synthetic)} disabled={busy || !synthetic} onClick={() => doBuyCollateral(a, 500_000n)}>
              Buy {a.symbol} (0.5 base)
            </button>
          ))}
        </div>
        <ResultBox r={result["buy"]} />
      </Section>

      <Section title="Log">
        <pre style={{ fontSize: 12, background: "#0b0b0b", color: "#d8d8d8", padding: 12, borderRadius: 8, maxHeight: 320, overflow: "auto" }}>
          {log.join("\n") || "(no activity yet)"}
        </pre>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16, marginTop: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}

function ResultBox({ r }: { r?: { ok?: boolean; text: string } }) {
  if (!r) return null;
  const color = r.ok === true ? "#15803d" : r.ok === false ? "#b91c1c" : "#666";
  const bg = r.ok === true ? "#f0fdf4" : r.ok === false ? "#fef2f2" : "#f5f5f5";
  return <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, fontSize: 12, color, background: bg, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{r.text}</div>;
}

function btn(primary: boolean, disabled: boolean): CSSProperties {
  return {
    padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8,
    border: primary ? "none" : "1px solid #999",
    background: primary ? "#6d28d9" : "#fff", color: primary ? "#fff" : "#333",
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
  };
}

export default function FlowsPage() {
  // Dev-only flow harness — 404 in production unless explicitly opted in
  // (mirrors /discovery). Keeps the test harness off the live site.
  if (!isFlowsEnabled(process.env, { production: process.env.NODE_ENV === "production" })) {
    notFound();
  }
  const cfg = resolveProbeConfig(ENV);
  const endpoint = solanaRpcEndpoint(cfg.solanaRpc, typeof window !== "undefined" ? window.location.origin : "");
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <FlowHarness />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
