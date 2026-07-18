"use client";

// Dev-only Phantom-connect probe for the Solana-native Compound lane.
// Proves the end-to-end write path: discover accounts (proxy #353) -> build
// DoTxUnsigned -> Phantom sign -> submit to Solana devnet -> confirm, plus
// read-routing against the synthetic address. NOT linked from the app nav.
//
// Prereqs to run (see lib/solana/probeConfig.ts for the verified defaults):
//   1. A local #353 proxy pointed at Hadrian (program + Solana devnet),
//      reachable via DISCOVERY_PROXY_UPSTREAM (default http://localhost:9090).
//   2. Phantom on Solana devnet with a little SOL (pays rent; compute is free).

import "@solana/wallet-adapter-react-ui/styles.css";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  ConnectionProvider,
  WalletProvider,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

// Client-only: WalletMultiButton renders text on the server but an icon on the
// client (it reads wallet state that only exists client-side), which trips a
// hydration mismatch. ssr:false renders it after mount, so no mismatch.
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type AccountMeta,
  type TransactionInstruction,
} from "@solana/web3.js";
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
  submitDoTxUnsigned,
  submitInstruction,
  submitInstructions,
  submitV0Instructions,
  computeBudgetIxs,
  treasureWallet,
  externalAuthPda,
  balanceKeyPda,
  associatedTokenAddress,
} from "@/lib/solana/submit";
import { ensureAlt } from "@/lib/solana/alt";
import { buildActivateAtaInstruction, buildDoTxUnsigned } from "@/lib/solana/instructions";
import { buildUnsignedEip1559Rlp } from "@/lib/solana/unsignedTx";
import { emulateCallAccounts } from "@/lib/solana/discovery";
import {
  repayAmount,
  encodeRepay,
  encodeAbsorb,
  encodeBuyCollateral,
  encodeApprove,
} from "@/lib/solana/cometCalldata";
import { notFound } from "next/navigation";
import { resolveProbeConfig, solanaRpcEndpoint } from "@/lib/solana/probeConfig";
import { solanaExplorerTx } from "@/lib/solana/explorer";
import { isDiscoveryEnabled } from "@/lib/discoveryGate";
import { discoveryAssets } from "@/lib/discoveryAssets";
import { DEFAULT_CHAIN_CONFIG_RAW } from "@/lib/config";
import { estimateGasBuffered } from "@/lib/gas";

// Circle devnet USDC (and the demo wrappers) are standard SPL Token.
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
// wrapper.mint_id() → the underlying SPL mint the synthetic's ATA holds.
const MINT_ID_ABI = [
  { type: "function", name: "mint_id", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bytes32" }] },
] as const;

// Literal NEXT_PUBLIC_ references so Next inlines them into the client bundle.
const ENV = {
  NEXT_PUBLIC_DISCOVERY_PROXY_URL: process.env.NEXT_PUBLIC_DISCOVERY_PROXY_URL,
  NEXT_PUBLIC_SOLANA_RPC: process.env.NEXT_PUBLIC_SOLANA_RPC,
  NEXT_PUBLIC_ROME_EVM_PROGRAM: process.env.NEXT_PUBLIC_ROME_EVM_PROGRAM,
  NEXT_PUBLIC_ROME_CHAIN_ID: process.env.NEXT_PUBLIC_ROME_CHAIN_ID,
  NEXT_PUBLIC_COMET_PROXY: process.env.NEXT_PUBLIC_COMET_PROXY,
  NEXT_PUBLIC_UNIFIED_TOKEN: process.env.NEXT_PUBLIC_UNIFIED_TOKEN,
};

// Cached wrapper's idempotent ATA-creator (owner = external_auth(user)).
const ENSURE_ATA_ABI = [
  {
    type: "function",
    name: "ensure_token_account",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

// HelperProgram precompile (0xff..09). create_pda(user) creates the synthetic's
// external_auth PDA — REQUIRED before the ATA (the ATA is owned by this PDA;
// without it rome-evm fails post-commit with PdaUntypedAccountNotFound).
const HELPER_PROGRAM = "0xff00000000000000000000000000000000000009" as Address;
const CREATE_PDA_ABI = [
  {
    type: "function",
    name: "create_pda",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
] as const;

// HelperProgram.transfer_spl_to_signer(uint64 amount, bytes32 mint) — selector
// 0x46efa679. Source = ata(external_auth(caller), mint) (the synthetic's
// PDA-ATA); destination = ata(signer, mint) where signer is the outer Solana tx
// signer (the Phantom wallet). The value-OUT return leg for Solana-native users:
// moves tokens from the synthetic back to the user's own Solana ATA. LEGACY
// track — must be its own tx, never bundled with a cached-track comet.withdraw.
const TRANSFER_SPL_TO_SIGNER_ABI = [
  {
    type: "function",
    name: "transfer_spl_to_signer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint64" },
      { name: "mint", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

// Compound v3 Comet: supply(asset, amount) pulls `asset` from msg.sender via
// transferFrom (needs the prior approve); withdraw(asset, amount) returns it to
// msg.sender (the synthetic) — decrements the position, credits the synthetic's
// wrapper balance. balanceOf(account) returns the base supply balance.
const COMET_ABI = [
  {
    type: "function",
    name: "supply",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "collateralBalanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "asset", type: "address" },
    ],
    outputs: [{ name: "", type: "uint128" }],
  },
  // borrow = withdraw(base) past your supply → opens debt. borrowBalanceOf is
  // the debt; baseBorrowMin is the minimum first borrow Comet enforces.
  {
    type: "function",
    name: "borrowBalanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "baseBorrowMin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Liquidation: absorb(absorber, accounts[]) seizes an underwater account's
  // collateral + clears its debt. isLiquidatable gates whether absorb succeeds.
  {
    type: "function",
    name: "isLiquidatable",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  // buyCollateral reward path: quoteCollateral(asset, baseAmount) → how much
  // collateral `baseAmount` of base buys at the storeFront discount.
  {
    type: "function",
    name: "quoteCollateral",
    stateMutability: "view",
    inputs: [
      { name: "asset", type: "address" },
      { name: "baseAmount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  // buyCollateral "is anything for sale?" pre-check: buyCollateral reverts
  // NotForSale when getReserves() >= targetReserves, and InsufficientReserves
  // when the buy exceeds getCollateralReserves(asset). Read these before
  // approving so we never leave a dangling approve on a comet with nothing
  // seized to sell.
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "int256" }] },
  { type: "function", name: "targetReserves", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "getCollateralReserves", stateMutability: "view", inputs: [{ name: "asset", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function",
    name: "numAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "baseTokenPriceFeed",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getAssetInfo",
    stateMutability: "view",
    inputs: [{ name: "i", type: "uint8" }],
    outputs: [
      {
        name: "",
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
      },
    ],
  },
] as const;

// Probe asset list (base + every collateral) derived from the ACTIVE chain's
// registry config — chain-agnostic, so this harness follows whatever chain
// NEXT_PUBLIC_DEFAULT_CHAIN_ID points at (no hardcoded addresses). amount =
// 1 whole token per asset, scaled by each asset's decimals; the underlying SPL
// is read per-asset via wrapper.mint_id() at call time. Bump tokensPerAsset for
// larger probes.
const ASSETS = discoveryAssets(DEFAULT_CHAIN_CONFIG_RAW);

// CompoundFaucet — claim() drops 100 wHEAT (+4 mocks +10 gas) to msg.sender,
// one-time per wallet. The synthetic claims via DoTxUnsigned → gets wHEAT into
// its EVM balance directly (no Phantom SPL / no Fund step needed).
const FAUCET = "0x878251BC3DB302E4915b720b948cBc6107eC479c" as const;
const WHEAT = "0x58e78208c8EDd4b9E8e49682701512dd2Ae63dB5" as const;
const FAUCET_ABI = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

function btnStyle(primary: boolean, disabled: boolean): CSSProperties {
  return {
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 8,
    border: primary ? "none" : "1px solid #555",
    background: primary ? "#6d28d9" : "#1c1c1c",
    color: primary ? "#fff" : "#ddd",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
  };
}

function Probe() {
  const cfg = useMemo(() => resolveProbeConfig(ENV), []);
  // cfg.solanaRpc defaults to the relative /api/solana-rpc proxy path; web3.js
  // Connection needs an absolute URL, so resolve it against the browser origin
  // (the proxy forwards server-side to the private SOLANA_RPC).
  const solanaRpcUrl = useMemo(
    () => solanaRpcEndpoint(cfg.solanaRpc, typeof window !== "undefined" ? window.location.origin : ""),
    [cfg.solanaRpc],
  );
  const { publicKey, signTransaction } = useWallet();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [assetIdx, setAssetIdx] = useState(0);
  const [liqVictim, setLiqVictim] = useState("");
  const asset = ASSETS[assetIdx];

  const append = useCallback((s: string) => {
    setLog((l) => [...l, `${new Date().toISOString().slice(11, 19)}  ${s}`]);
  }, []);

  // Solana-explorer link for the active chain's cluster (from the registry),
  // so links open the correct cluster on any chain.
  const explorerUrl = useCallback(
    (sig: string) => solanaExplorerTx(sig, cfg.solanaCluster),
    [cfg.solanaCluster],
  );

  // History of landed Solana txs — scraped from the log (every "sig=<base58>")
  // and persisted to localStorage so it survives portal reloads.
  const [txHistory, setTxHistory] = useState<{ label: string; sig: string; t: string }[]>([]);
  useEffect(() => {
    try {
      const s = localStorage.getItem("rome-disc-txs");
      if (s) setTxHistory(JSON.parse(s));
    } catch {}
  }, []);
  useEffect(() => {
    setTxHistory((prev) => {
      const seen = new Set(prev.map((x) => x.sig));
      const add: typeof prev = [];
      for (const line of log) {
        const m = line.match(/sig=([1-9A-HJ-NP-Za-km-z]{60,90})/);
        if (m && !seen.has(m[1])) {
          seen.add(m[1]);
          const label =
            line.replace(/^\d\d:\d\d:\d\d\s+/, "").replace(/\s+sig=.*/, "").replace(/\s+LANDED\s*$/, "").trim() || "tx";
          add.push({ label, sig: m[1], t: new Date().toISOString().slice(11, 19) });
        }
      }
      if (!add.length) return prev;
      const next = [...prev, ...add];
      try {
        localStorage.setItem("rome-disc-txs", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [log]);
  const clearHistory = useCallback(() => {
    setTxHistory([]);
    try {
      localStorage.removeItem("rome-disc-txs");
    } catch {}
  }, []);

  // CU + peak heap from the Solana receipt. A tx with multiple rome ixs emits a
  // `Heap <n>` line per ix — report the MAX so a combined fund+supply shows the
  // supply's real peak, not the (tiny) fund ix's.
  const reportStats = useCallback(
    async (connection: Connection, signature: string) => {
      const txi = await connection
        .getTransaction(signature, { maxSupportedTransactionVersion: 0 })
        .catch(() => null);
      const cu = txi?.meta?.computeUnitsConsumed;
      const heaps = (txi?.meta?.logMessages ?? [])
        .map((l) => l.match(/Heap (\d+)/)?.[1])
        .filter((x): x is string => !!x)
        .map(Number);
      const maxHeap = heaps.length ? Math.max(...heaps) : undefined;
      append(`  ↳ CU=${cu ?? "?"} / 1,350,000   heap(peak)=${maxHeap ?? "?"}`);
    },
    [append],
  );

  const synthetic = useMemo(
    () => (publicKey ? syntheticAddress(publicKey) : null),
    [publicKey],
  );

  // Load the COMPLETE Solana→rome-evm history from chain (not just this
  // session's log): every DoTxUnsigned touches the synthetic's balance_key PDA,
  // so getSignaturesForAddress on it lists them all. Merged into txHistory
  // (session labels win; on-chain fills the rest).
  const loadOnChainHistory = useCallback(async () => {
    if (!synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const balanceKey = balanceKeyPda(new PublicKey(cfg.programId), cfg.chainId, synthetic);
      const sigs = await connection.getSignaturesForAddress(balanceKey, { limit: 50 });
      append(`on-chain: ${sigs.length} Solana→rome-evm txns for synthetic ${balanceKey.toBase58().slice(0, 8)}…`);
      setTxHistory((prev) => {
        const seen = new Set(prev.map((x) => x.sig));
        const add = sigs
          .filter((s) => !seen.has(s.signature))
          .map((s) => ({
            label: s.err ? "Solana→rome-evm (failed)" : "Solana→rome-evm",
            sig: s.signature,
            t: s.blockTime ? new Date(s.blockTime * 1000).toISOString().slice(11, 19) : "?",
          }));
        if (!add.length) return prev;
        const next = [...prev, ...add];
        try {
          localStorage.setItem("rome-disc-txs", JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (e) {
      append(`on-chain history FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [synthetic, cfg, append]);

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

  const readState = useCallback(async () => {
    if (!synthetic) return append("connect Phantom first");
    try {
      const comet = cfg.comet as Address;
      const fmt = (v: bigint, d: number) =>
        Number(formatUnits(v, d)).toLocaleString(undefined, { maximumFractionDigits: 4 });
      const [nonce, baseSupplied, debt, allowance] = await Promise.all([
        evmClient.getTransactionCount({ address: synthetic }),
        evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "balanceOf", args: [synthetic] }) as Promise<bigint>,
        evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "borrowBalanceOf", args: [synthetic] }) as Promise<bigint>,
        evmClient.readContract({ address: ASSETS[0].address, abi: erc20Abi, functionName: "allowance", args: [synthetic, comet] }) as Promise<bigint>,
      ]);
      append(`── synthetic ${synthetic} · nonce ${nonce} ──`);
      for (let i = 0; i < ASSETS.length; i++) {
        const a = ASSETS[i];
        const [dec, wallet] = await Promise.all([
          evmClient.readContract({ address: a.address, abi: erc20Abi, functionName: "decimals" }) as Promise<number>,
          evmClient.readContract({ address: a.address, abi: erc20Abi, functionName: "balanceOf", args: [synthetic] }) as Promise<bigint>,
        ]);
        if (i === 0) {
          // Base asset: supplied = comet.balanceOf, debt = borrowBalanceOf.
          append(`  ${a.symbol.padEnd(9)} wallet ${fmt(wallet, dec)} · supplied ${fmt(baseSupplied, dec)} · borrowed ${fmt(debt, dec)}`);
        } else {
          const collat = (await evmClient.readContract({
            address: comet, abi: COMET_ABI, functionName: "collateralBalanceOf", args: [synthetic, a.address],
          })) as bigint;
          append(`  ${a.symbol.padEnd(9)} wallet ${fmt(wallet, dec)} · collateral ${fmt(collat, dec)}`);
        }
      }
      append(`  allowance(${ASSETS[0].symbol} → comet): ${allowance > 0n ? "set" : "0 (approve first)"}`);
    } catch (e) {
      append(`reads FAILED: ${(e as Error).message}`);
    }
  }, [synthetic, evmClient, cfg, append]);

  // Shared submit: discover → DoTxUnsigned → Phantom sign → submit → confirm,
  // then surface the two budgets (CU + heap) from the Solana receipt.
  const submitCall = useCallback(
    async (label: string, to: Address, data: Hex): Promise<string | null> => {
      if (!publicKey || !signTransaction || !synthetic) {
        append("connect Phantom first");
        return null;
      }
      const gasPrice = await evmClient.getGasPrice();
      const gasLimit = await estimateGasBuffered(evmClient, { account: synthetic, to, data });
      const nonce = await evmClient.getTransactionCount({ address: synthetic });
      const connection = new Connection(solanaRpcUrl, "confirmed");
      append(`${label}: DoTxUnsigned nonce=${nonce} — sign in Phantom ..`);
      const { signature } = await submitDoTxUnsigned(
        {
          call: { to, data },
          payer: publicKey,
          nonce: BigInt(nonce),
          fee: { maxFeePerGas: gasPrice, maxPriorityFeePerGas: gasPrice, gasLimit },
        },
        {
          proxyUrl: "/api/discovery",
          connection,
          programId: new PublicKey(cfg.programId),
          chainId: cfg.chainId,
          signTransaction: (tx: Transaction) => signTransaction(tx),
        },
      );
      append(`${label} LANDED  sig=${signature}`);
      await reportStats(connection, signature);
      return signature;
    },
    [publicKey, signTransaction, synthetic, evmClient, cfg, asset, append, reportStats],
  );

  // Discover an EVM call's complete Solana account list from the proxy
  // (rome_emulateCallAccounts). The proxy itself now appends the two accounts the
  // emulator omits — treasure_wallet(0) + the synthetic's balance_key PDA — so the
  // client uses the result VERBATIM (no hand-picking), exactly like the EVM lane
  // gets its account list resolved by the proxy. Used as the single discovery
  // entry for every flow.
  const discoverAugmented = useCallback(
    async (to: Hex, data: Hex): Promise<AccountMeta[]> =>
      emulateCallAccounts("/api/discovery", { from: synthetic!, to, data }, publicKey!.toBase58()),
    [synthetic, publicKey],
  );

  // Submit N EVM calls as sequential-nonce DoTxUnsigned legs in ONE Solana tx
  // (1 Phantom popup), over the shared per-comet ALT. The legs are atomic — any
  // revert rolls back all (so a bundled exact approve can't leave a standing
  // allowance if the spend fails). `nativePrefix` ixs (e.g. ActivateAta fund)
  // run before the DoTx legs and consume no EVM nonce. Each leg carries its own
  // discovered account list (the ALT only compresses keys, doesn't supply them).
  const submitAtomicBundle = useCallback(
    async (
      legs: { to: Hex; data: Hex; accounts: AccountMeta[] }[],
      opts: { nativePrefix?: TransactionInstruction[]; cuLimit?: number; label: string },
    ): Promise<string | null> => {
      if (!publicKey || !signTransaction || !synthetic) {
        append("connect Phantom first");
        return null;
      }
      const programId = new PublicKey(cfg.programId);
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const union = new Map<string, PublicKey>();
      for (const leg of legs) for (const a of leg.accounts) union.set(a.pubkey.toBase58(), a.pubkey);
      const alt = await ensureAlt(
        [...union.values()],
        { connection, payer: publicKey, signTransaction: (tx: Transaction) => signTransaction(tx) },
        `${synthetic}-${cfg.comet}`,
        append,
      );
      const gasPrice = await evmClient.getGasPrice();
      const startNonce = await evmClient.getTransactionCount({ address: synthetic });
      const dotxIxs = legs.map((leg, i) =>
        buildDoTxUnsigned({
          programId,
          unsignedRlp: buildUnsignedEip1559Rlp({
            chainId: cfg.chainId,
            nonce: BigInt(startNonce + i),
            maxFeePerGas: gasPrice,
            maxPriorityFeePerGas: gasPrice,
            gasLimit: 2_000_000n,
            to: leg.to,
            data: leg.data,
          }),
          accounts: leg.accounts,
        }),
      );
      append(
        `${opts.label}: ${legs.length}-leg atomic bundle (nonce ${startNonce}..${startNonce + legs.length - 1})` +
          ` over ALT (${alt.state.addresses.length} keys) — 1 sign ..`,
      );
      const { signature } = await submitV0Instructions(
        [...computeBudgetIxs(opts.cuLimit ?? 1_400_000), ...(opts.nativePrefix ?? []), ...dotxIxs],
        [alt],
        { connection, feePayer: publicKey, signTransaction: (tx: VersionedTransaction) => signTransaction(tx) },
      );
      append(`${opts.label} LANDED  sig=${signature}`);
      await reportStats(connection, signature);
      return signature;
    },
    [publicKey, signTransaction, synthetic, cfg, evmClient, append, reportStats],
  );

  // Step 1 — ACTIVATE = two txs: (1a) create the synthetic's external_auth PDA,
  // then (1b) create its wUSDC ATA (owned by that PDA). Both in their own txs —
  // the PDA must exist before the ATA, and each ATA-create is ~950K CU so it
  // can't be bundled with the approve. Each waits for confirmation, so the
  // synthetic's nonce sequences cleanly across them.
  // Activate — ONE-TIME per-user-per-comet setup. Front-loads everything later
  // actions need so each action is a single atomic popup: (1) the synthetic PDA,
  // (2) the synthetic's ATA for the base + EVERY collateral (so any asset can be
  // received — incl. the buyCollateral recipient ATA), (3) a pre-built ALT under
  // the SHARED key `${synthetic}-${comet}` holding the complete account set
  // (union of per-asset supply discoveries + all synthetic ATAs + treasure +
  // balanceKey). Every action then reuses this ALT (ensureAlt sees it covers
  // everything → 0 setup txs). ALT must pre-exist + be reused — it can't be
  // created in the same tx that uses it (needs ~1 slot to activate).
  const runActivate = useCallback(async () => {
    if (!publicKey || !signTransaction || !synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const programId = new PublicKey(cfg.programId);
      const comet = cfg.comet as Address;
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const extAuth = externalAuthPda(programId, synthetic);

      // 1. synthetic PDA (idempotent — skip if it already exists so Activate
      //    can be re-run safely)
      if (!(await connection.getAccountInfo(extAuth))) {
        const sig1 = await submitCall("1. create synthetic PDA", HELPER_PROGRAM, encodeFunctionData({ abi: CREATE_PDA_ABI, functionName: "create_pda", args: [synthetic] }));
        if (!sig1) return;
      } else {
        append("1. synthetic PDA already exists — skip");
      }

      // 2. enumerate the comet's assets (base + collats)
      const numAssets = Number(await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "numAssets" }));
      const assetAddrs: Address[] = [ASSETS[0].address];
      for (let i = 0; i < numAssets; i++) {
        const info = (await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "getAssetInfo", args: [i] })) as { asset: Address };
        assetAddrs.push(info.asset);
      }
      append(`2. ensuring ${assetAddrs.length} ATAs (base + ${numAssets} collats), creating only the missing ones ..`);

      // 3. create the synthetic's ATA for each asset (skip ones that exist)
      const ataPubkeys: PublicKey[] = [];
      for (const a of assetAddrs) {
        const mintHex = (await evmClient.readContract({ address: a, abi: MINT_ID_ABI, functionName: "mint_id" })) as Hex;
        const ata = associatedTokenAddress(new PublicKey(Buffer.from(mintHex.slice(2), "hex")), extAuth, TOKEN_PROGRAM);
        ataPubkeys.push(ata);
        if (!(await connection.getAccountInfo(ata))) {
          const ok = await submitCall(`   create ATA ${a.slice(0, 10)}…`, a, encodeFunctionData({ abi: ENSURE_ATA_ABI, functionName: "ensure_token_account", args: [synthetic] }));
          if (!ok) return;
        }
      }

      // 4. comprehensive account set for the ALT: union of supply(asset,0)
      //    discoveries + all synthetic ATAs + treasure + balanceKey
      append("3. discovering the complete account set for the ALT ..");
      const allAccts = new Map<string, PublicKey>();
      for (const a of assetAddrs) {
        const data = encodeFunctionData({ abi: COMET_ABI, functionName: "supply", args: [a, 0n] });
        const accts = await emulateCallAccounts("/api/discovery", { from: synthetic, to: comet as Hex, data }, publicKey.toBase58());
        for (const x of accts) allAccts.set(x.pubkey.toBase58(), x.pubkey);
      }
      for (const ata of ataPubkeys) allAccts.set(ata.toBase58(), ata);
      for (const k of [treasureWallet(programId, cfg.chainId, 0), balanceKeyPda(programId, cfg.chainId, synthetic)]) allAccts.set(k.toBase58(), k);

      // 5. build the shared ALT (one-time). Actions reuse it by the same key.
      append(`4. building ALT with ${allAccts.size} keys (shared, reused by every action) ..`);
      const alt = await ensureAlt([...allAccts.values()], { connection, payer: publicKey, signTransaction: (tx: Transaction) => signTransaction(tx) }, `${synthetic}-${comet}`, append);
      append(`✓ ACTIVATED — PDA + ${ataPubkeys.length} ATAs + ALT (${alt.state.addresses.length} keys). Later actions are now 1-popup atomic bundles.`);
    } catch (e) {
      append(`activate FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, synthetic, evmClient, cfg, submitCall, append]);

  // NOTE: there is intentionally no standalone approve. A standing/unbounded
  // approve is a footgun — if a user approves but doesn't act, anyone could pull
  // up to the allowance. Every spend (supply / repay / buyCollateral) does its
  // OWN exact-amount approve (encodeApprove) immediately before the spend that
  // consumes it in full, so the allowance never outlives the action (residual 0).

  // Step 2b — FUND: ActivateAta moves the underlying SPL (Circle USDC) from
  // Phantom's own ATA into the synthetic's ATA, Solana-natively. Not a
  // DoTxUnsigned (no VM/treasure/heap) — the signer authorizes the SPL transfer.
  const runFund = useCallback(async () => {
    if (!publicKey || !signTransaction || !synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const programId = new PublicKey(cfg.programId);
      const mintHex = (await evmClient.readContract({
        address: asset.address,
        abi: MINT_ID_ABI,
        functionName: "mint_id",
      })) as Hex;
      const mint = new PublicKey(Buffer.from(mintHex.slice(2), "hex"));
      const extAuth = externalAuthPda(programId, synthetic);
      const toAta = associatedTokenAddress(mint, extAuth, TOKEN_PROGRAM);
      const fromAta = associatedTokenAddress(mint, publicKey, TOKEN_PROGRAM);
      const amount = asset.amount;
      append(`fund: ActivateAta ${amount} of ${mint.toBase58()} (Phantom→synthetic ATA) — sign ..`);
      const ix = buildActivateAtaInstruction({
        programId,
        chainId: cfg.chainId,
        mint,
        tokens: amount,
        signer: publicKey,
        fromAta,
        toAta,
        tokenProgram: TOKEN_PROGRAM,
      });
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const { signature } = await submitInstruction(ix, {
        connection,
        feePayer: publicKey,
        signTransaction: (tx: Transaction) => signTransaction(tx),
      });
      append(`fund LANDED  sig=${signature}`);
      await reportStats(connection, signature);
      const bal = (await evmClient.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [synthetic],
      })) as bigint;
      append(`  ↳ synthetic ${asset.symbol} balance now ${bal}  ${bal > 0n ? "✓ funded" : "✗ still zero"}`);
    } catch (e) {
      append(`fund FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, synthetic, evmClient, cfg, asset, append, reportStats]);

  // Step 3 — supply the synthetic's full balance into the Comet (already-funded
  // path; use "Fund+Supply" below to fund + supply in one shot). Bundles an
  // EXACT-amount approve with the supply in ONE atomic tx (1 popup): the comet's
  // allowance is granted for precisely `bal` and consumed by the supply, so no
  // standing approve survives the tx (residual = 0, read back below).
  const runSupply = useCallback(async () => {
    if (!synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const comet = cfg.comet as Address;
      const bal = (await evmClient.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [synthetic],
      })) as bigint;
      if (bal === 0n) {
        append(`synthetic holds 0 ${asset.symbol} — fund it first (Fund, or use Fund+Supply)`);
        return;
      }
      // supply() pulls `bal` via transferFrom → needs an allowance. Approve
      // EXACTLY `bal` first (separate tx; cached wrapper → SPL delegate to comet),
      // then discover the supply at the REAL amount. A 0-amount transfer
      // short-circuits in some wrappers, so an amount=0 discovery omits the
      // source/dest ATAs (and, supplying base in debt, the repay branch's feed
      // accounts) → handler.rs:122 missing-account panic. Real-amount discovery
      // (balance + allowance live) returns the complete set; the supply consumes
      // the delegate in full → residual 0. Same pattern as repay / buyCollateral.
      const allowance = (await evmClient.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [synthetic, comet],
      })) as bigint;
      if (allowance < bal) {
        const okA = await submitCall(`approve(exact ${bal} ${asset.symbol} → comet)`, asset.address, encodeApprove(comet, bal));
        if (!okA) return;
      }
      const supplyData = encodeFunctionData({ abi: COMET_ABI, functionName: "supply", args: [asset.address, bal] });
      const leg = { to: comet as Hex, data: supplyData, accounts: await discoverAugmented(comet as Hex, supplyData) };
      const sig = await submitAtomicBundle([leg], { label: `supply ${asset.symbol}`, cuLimit: 1_400_000 });
      if (sig) {
        if (assetIdx === 0) {
          const supplied = (await evmClient.readContract({
            address: comet,
            abi: COMET_ABI,
            functionName: "balanceOf",
            args: [synthetic],
          })) as bigint;
          append(`  ↳ comet base balanceOf(synthetic)=${supplied}  ✓ supplied into Comet`);
        } else {
          const col = (await evmClient.readContract({
            address: comet,
            abi: COMET_ABI,
            functionName: "collateralBalanceOf",
            args: [synthetic, asset.address],
          })) as bigint;
          append(`  ↳ comet.collateralBalanceOf(synthetic, ${asset.symbol})=${col}  ${col > 0n ? "✓ supplied" : "✗ zero"}`);
        }
        const residual = (await evmClient.readContract({
          address: asset.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [synthetic, comet],
        })) as bigint;
        append(`  ↳ residual allowance(→comet)=${residual}  ${residual === 0n ? "✓ no standing approve" : "⚠ leftover allowance"}`);
      }
    } catch (e) {
      append(`supply FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [synthetic, cfg, evmClient, asset, assetIdx, submitCall, discoverAugmented, submitAtomicBundle, append]);

  // Step 4 — WITHDRAW: pull the position back out of the Comet. The synthetic
  // already has a position (supplied) so real-amount discovery surfaces the full
  // account list — no amount=0 trick (that was only for first-time storage
  // allocation on supply). The tokens land back in the synthetic's wrapper
  // balance (its PDA-ATA); a later transfer_spl_to_signer returns them to the
  // user's own Solana ATA (the value-out half of the round trip).
  const runWithdraw = useCallback(async () => {
    if (!synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const isBase = assetIdx === 0;
      const position = (await evmClient.readContract({
        address: cfg.comet as Address,
        abi: COMET_ABI,
        functionName: isBase ? "balanceOf" : "collateralBalanceOf",
        args: isBase ? [synthetic] : [synthetic, asset.address],
      })) as bigint;
      if (position === 0n) {
        append(`no ${asset.symbol} position to withdraw — supply first`);
        return;
      }
      const before = (await evmClient.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [synthetic],
      })) as bigint;
      const data = encodeFunctionData({
        abi: COMET_ABI,
        functionName: "withdraw",
        args: [asset.address, position],
      });
      const sig = await submitCall(`withdraw(${asset.symbol}, ${position})`, cfg.comet as Address, data);
      if (sig) {
        const after = (await evmClient.readContract({
          address: asset.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [synthetic],
        })) as bigint;
        const remaining = (await evmClient.readContract({
          address: cfg.comet as Address,
          abi: COMET_ABI,
          functionName: isBase ? "balanceOf" : "collateralBalanceOf",
          args: isBase ? [synthetic] : [synthetic, asset.address],
        })) as bigint;
        const returned = after - before;
        append(
          `  ↳ synthetic ${asset.symbol} balance ${before}→${after} (+${returned}); comet position now ${remaining}  ` +
            `${returned === position && remaining === 0n ? "✓ withdrawn" : "⚠ partial/unexpected"}`,
        );
      }
    } catch (e) {
      append(`withdraw FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [synthetic, cfg, evmClient, submitCall, asset, assetIdx, append]);

  // Step 5 — RETURN TO WALLET: move the synthetic's wrapper balance back to the
  // Phantom user's OWN Solana ATA via HelperProgram.transfer_spl_to_signer. This
  // is the value-OUT leg that closes the round trip (Compound → synthetic →
  // user's wallet). Legacy-track precompile, so it is its own DoTxUnsigned tx
  // (never bundled with the cached-track withdraw). Verifies both ends: the
  // synthetic's wrapper balance drops, the user's on-chain SPL ATA rises.
  const runReturnToWallet = useCallback(async () => {
    if (!publicKey || !signTransaction || !synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const balance = (await evmClient.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [synthetic],
      })) as bigint;
      if (balance === 0n) {
        append(`synthetic holds 0 ${asset.symbol} — withdraw from Comet first`);
        return;
      }
      const mintHex = (await evmClient.readContract({
        address: asset.address,
        abi: MINT_ID_ABI,
        functionName: "mint_id",
      })) as Hex;
      const mint = new PublicKey(Buffer.from(mintHex.slice(2), "hex"));
      const userAta = associatedTokenAddress(mint, publicKey, TOKEN_PROGRAM);
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const before = await connection
        .getTokenAccountBalance(userAta)
        .then((r) => BigInt(r.value.amount))
        .catch(() => null);
      const data = encodeFunctionData({
        abi: TRANSFER_SPL_TO_SIGNER_ABI,
        functionName: "transfer_spl_to_signer",
        args: [balance, mintHex],
      });
      // transfer_spl_to_signer's destination = ata(SIGNER, mint) — the outer
      // Solana signer (your Phantom wallet), NOT a derived/PDA ATA. The signer
      // isn't bound in eth_estimateGas (it resolves a signer-less ATA →
      // "destination ata … is not owned by SPL-program"), so we can't estimate
      // — the EVM gasLimit/gasPrice below are NOMINAL. Rome doesn't charge EVM
      // gas (sim showed GAS_VALUE=0); the real meter is Solana CU, capped at
      // 1.35M by computeBudgetIxs (this call uses ~56K). The accounts are the
      // actual fix — see extraAccounts.
      const gasPrice = await evmClient.getGasPrice();
      const nonce = await evmClient.getTransactionCount({ address: synthetic });
      // The emulator can't bind the outer signer for transfer_spl_to_signer, so
      // discovery truncates to the tx-init accounts. Supply the 6 it misses —
      // verified on-chain via simulateTransaction (Succeed(Returned), 56K CU).
      const programId = new PublicKey(cfg.programId);
      const extAuth = externalAuthPda(programId, synthetic);
      const extraAccounts = [
        { pubkey: balanceKeyPda(programId, cfg.chainId, synthetic), isSigner: false, isWritable: true },
        { pubkey: extAuth, isSigner: false, isWritable: true },
        { pubkey: associatedTokenAddress(mint, extAuth, TOKEN_PROGRAM), isSigner: false, isWritable: true },
        { pubkey: userAta, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      ];
      append(
        `return ${balance} ${asset.symbol} → signer ATA ${userAta.toBase58()} (fixed gas, +${extraAccounts.length} accts) — sign ..`,
      );
      const { signature } = await submitDoTxUnsigned(
        {
          call: { to: HELPER_PROGRAM, data },
          payer: publicKey,
          nonce: BigInt(nonce),
          fee: { maxFeePerGas: gasPrice, maxPriorityFeePerGas: gasPrice, gasLimit: 2_000_000n },
          extraAccounts,
        },
        {
          proxyUrl: "/api/discovery",
          connection,
          programId,
          chainId: cfg.chainId,
          signTransaction: (tx: Transaction) => signTransaction(tx),
        },
      );
      append(`return LANDED  sig=${signature}`);
      await reportStats(connection, signature);
      const synthAfter = (await evmClient.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [synthetic],
      })) as bigint;
      const after = await connection
        .getTokenAccountBalance(userAta)
        .then((r) => BigInt(r.value.amount))
        .catch(() => null);
      const delta = before !== null && after !== null ? after - before : null;
      append(
        `  ↳ synthetic ${asset.symbol} ${balance}→${synthAfter}; signer ATA ${before ?? "?"}→${after ?? "?"}` +
          `${delta !== null ? ` (+${delta})` : ""}  ${synthAfter === 0n && delta === balance ? "✓ returned to your wallet" : "⚠ check"}`,
      );
    } catch (e) {
      append(`return-to-wallet FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, synthetic, evmClient, cfg, asset, append, reportStats]);

  // ★ EXIT IN ONE TX — withdraw from Comet AND return to the user's own Solana
  // ATA in a SINGLE Phantom-signed Solana tx. Two DoTxUnsigned instructions:
  // ix1 comet.withdraw (cached track) → synthetic's ATA, ix2
  // transfer_spl_to_signer (legacy track) → user's wallet ATA. They coexist
  // because found_cpi is per-DoTx-execution, not per-Solana-tx (verified
  // handler_non_evm.rs). Nonces n / n+1 sequence — ix1's nonce++ commits to the
  // balance PDA and is visible to ix2 within the tx. ix2 needs the 6 accounts
  // discovery can't surface (see runReturnToWallet); ix1's discovery is complete
  // because the position exists. ~702K CU total, under the 1.35M budget.
  const runWithdrawToWallet = useCallback(async () => {
    if (!publicKey || !signTransaction || !synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const isBase = assetIdx === 0;
      const position = (await evmClient.readContract({
        address: cfg.comet as Address,
        abi: COMET_ABI,
        functionName: isBase ? "balanceOf" : "collateralBalanceOf",
        args: isBase ? [synthetic] : [synthetic, asset.address],
      })) as bigint;
      if (position === 0n) {
        append(`no ${asset.symbol} position to withdraw — supply first`);
        return;
      }
      const programId = new PublicKey(cfg.programId);
      const mintHex = (await evmClient.readContract({
        address: asset.address,
        abi: MINT_ID_ABI,
        functionName: "mint_id",
      })) as Hex;
      const mint = new PublicKey(Buffer.from(mintHex.slice(2), "hex"));
      const extAuth = externalAuthPda(programId, synthetic);
      const userAta = associatedTokenAddress(mint, publicKey, TOKEN_PROGRAM);
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const before = await connection
        .getTokenAccountBalance(userAta)
        .then((r) => BigInt(r.value.amount))
        .catch(() => null);

      const gasPrice = await evmClient.getGasPrice();
      const nonce = await evmClient.getTransactionCount({ address: synthetic });
      const fee = { maxFeePerGas: gasPrice, maxPriorityFeePerGas: gasPrice, gasLimit: 2_000_000n };
      const treasure = treasureWallet(programId, cfg.chainId, 0);

      // ix1 — withdraw (cached). Position exists, so discovery is complete.
      const withdrawData = encodeFunctionData({
        abi: COMET_ABI,
        functionName: "withdraw",
        args: [asset.address, position],
      });
      const withdrawAccounts = await emulateCallAccounts(
        "/api/discovery",
        { from: synthetic, to: cfg.comet as Hex, data: withdrawData },
        publicKey.toBase58(),
      );
      if (!withdrawAccounts.some((a) => a.pubkey.equals(treasure))) {
        withdrawAccounts.push({ pubkey: treasure, isSigner: false, isWritable: true });
      }
      const withdrawIx = buildDoTxUnsigned({
        programId,
        unsignedRlp: buildUnsignedEip1559Rlp({ chainId: cfg.chainId, nonce: BigInt(nonce), ...fee, to: cfg.comet as Hex, data: withdrawData }),
        accounts: withdrawAccounts,
      });

      // ix2 — transfer_spl_to_signer (legacy), nonce+1. Discovery truncates →
      // append the 6 it misses (same set as runReturnToWallet).
      const transferData = encodeFunctionData({
        abi: TRANSFER_SPL_TO_SIGNER_ABI,
        functionName: "transfer_spl_to_signer",
        args: [position, mintHex],
      });
      const transferAccounts = await emulateCallAccounts(
        "/api/discovery",
        { from: synthetic, to: HELPER_PROGRAM, data: transferData },
        publicKey.toBase58(),
      );
      const extras = [
        { pubkey: balanceKeyPda(programId, cfg.chainId, synthetic), isSigner: false, isWritable: true },
        { pubkey: extAuth, isSigner: false, isWritable: true },
        { pubkey: associatedTokenAddress(mint, extAuth, TOKEN_PROGRAM), isSigner: false, isWritable: true },
        { pubkey: userAta, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: treasure, isSigner: false, isWritable: true },
      ];
      for (const e of extras) {
        if (!transferAccounts.some((a) => a.pubkey.equals(e.pubkey))) transferAccounts.push(e);
      }
      const transferIx = buildDoTxUnsigned({
        programId,
        unsignedRlp: buildUnsignedEip1559Rlp({ chainId: cfg.chainId, nonce: BigInt(nonce + 1), ...fee, to: HELPER_PROGRAM, data: transferData }),
        accounts: transferAccounts,
      });

      // Collateral withdraw pulls in oracle/price accounts (solvency valuation),
      // which pushes the two-DoTxUnsigned combined tx past Solana's 1232-byte
      // limit — base (no oracle) fits in ONE tx, collateral doesn't. Size-check
      // before signing; if over, auto-split into two sequential txs. The
      // pre-built nonces (n / n+1) still line up: tx1's nonce++ lands before tx2.
      const deps = { connection, feePayer: publicKey, signTransaction: (tx: Transaction) => signTransaction(tx) };
      const probe = new Transaction();
      probe.feePayer = publicKey;
      probe.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      [...computeBudgetIxs(), withdrawIx, transferIx].forEach((ix) => probe.add(ix));
      const size = probe.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
      if (size <= 1232) {
        append(`★ withdraw ${position} ${asset.symbol} → wallet — ONE tx (${size}B), sign once ..`);
        const { signature } = await submitInstructions([...computeBudgetIxs(), withdrawIx, transferIx], deps);
        append(`★ LANDED  sig=${signature}`);
        await reportStats(connection, signature);
      } else {
        append(`★ combined ${size}B > 1232 (collateral pulls oracle accts) — splitting into 2 txs, sign twice ..`);
        const w = await submitInstructions([...computeBudgetIxs(), withdrawIx], deps);
        append(`  1/2 withdraw LANDED  sig=${w.signature}`);
        await reportStats(connection, w.signature);
        const t = await submitInstructions([...computeBudgetIxs(), transferIx], deps);
        append(`  2/2 return LANDED  sig=${t.signature}`);
        await reportStats(connection, t.signature);
      }
      const remaining = (await evmClient.readContract({
        address: cfg.comet as Address,
        abi: COMET_ABI,
        functionName: isBase ? "balanceOf" : "collateralBalanceOf",
        args: isBase ? [synthetic] : [synthetic, asset.address],
      })) as bigint;
      const after = await connection
        .getTokenAccountBalance(userAta)
        .then((r) => BigInt(r.value.amount))
        .catch(() => null);
      const delta = before !== null && after !== null ? after - before : null;
      append(
        `  ↳ comet position ${position}→${remaining}; signer ATA ${before ?? "?"}→${after ?? "?"}` +
          `${delta !== null ? ` (+${delta})` : ""}  ${remaining === 0n && delta === position ? "✓ withdrawn to your wallet in ONE tx" : "⚠ check"}`,
      );
    } catch (e) {
      append(`withdraw-to-wallet FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, synthetic, evmClient, cfg, asset, assetIdx, append, reportStats]);

  // BORROW — comet.withdraw(base) past your supply opens a debt backed by
  // collateral. Mechanically it's withdraw of the BASE asset; Comet routes it
  // to a borrow when balanceOf < amount. PREREQ: the synthetic must already
  // hold collateral (supply wETH/wSOL first) or it reverts. The borrowed base
  // lands in the synthetic's wrapper balance (then transfer_spl_to_signer can
  // return it). Heavier than a plain withdraw (collateral valuation + oracle
  // reads) — watch CU; if it exceeds the 1.35M atomic budget it needs iterative.
  const runPositions = useCallback(async () => {
    if (!synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const SYM: Record<string, string> = {
        "0x55e4502d799938582bc2a15771acc6a4d2928273": "wETH",
        "0x8c965f79b3d9bb95c12687e533fd5490b9c251cc": "wSOL",
        "0x58e78208c8edd4b9e8e49682701512dd2ae63db5": "wHEAT",
      };
      const FEED: Record<string, string> = {
        "0xff1adc858a6e16ad146b020da1cbfa5891a76f97": "USDC",
        "0xbe869fca226545927e671e60f32720db9dec5980": "ETH",
        "0x63c28e0ade03b38e32b9cd85f2dd9b9fbb89185f": "SOL",
      };
      // The synthetic can hold positions on any deployed comet — scan known
      // comets (current + prior deploys), not just the one the portal points at.
      const KNOWN: { address: Address; label: string }[] = [
        { address: cfg.comet as Address, label: "current" },
        { address: "0x81B86018896CA5fDA001dcf842A5c1086Ddfc5C5", label: "wETH/wSOL/wHEAT" },
        { address: "0x9609f4B1481E25c547F1D441441EF9f57a9eE489", label: "wETH/wSOL" },
      ];
      const seen = new Set<string>();
      const comets = KNOWN.filter((c) => {
        const k = c.address?.toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      append(`open positions for ${synthetic}:`);
      let anyOpen = false;
      for (const { address: comet, label } of comets) {
        const [baseBal, debt, n, baseFeed] = await Promise.all([
          evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "balanceOf", args: [synthetic] }) as Promise<bigint>,
          evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "borrowBalanceOf", args: [synthetic] }) as Promise<bigint>,
          evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "numAssets" }) as Promise<number>,
          evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "baseTokenPriceFeed" }) as Promise<Address>,
        ]);
        const open: string[] = [];
        const feeds = new Set<string>([baseFeed.toLowerCase()]); // a borrow always reads the base price
        if (baseBal > 0n) open.push(`base wUSDC supplied ${baseBal}`);
        if (debt > 0n) open.push(`DEBT ${debt}`);
        for (let i = 0; i < n; i++) {
          const info = (await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "getAssetInfo", args: [i] })) as { asset: Address; priceFeed: Address };
          const col = (await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "collateralBalanceOf", args: [synthetic, info.asset] })) as bigint;
          if (col > 0n) {
            open.push(`${SYM[info.asset.toLowerCase()] ?? info.asset.slice(0, 10)} collateral ${col} (feed ${FEED[info.priceFeed.toLowerCase()] ?? "?"})`);
            feeds.add(info.priceFeed.toLowerCase());
          }
        }
        if (open.length) {
          anyOpen = true;
          append(`  ${comet} (${label}): ${open.join("; ")}`);
          append(`     → a borrow here reads ${feeds.size} distinct feed(s); >1 exceeds the 1.4M CU cap (measured).`);
        }
      }
      if (!anyOpen) append("  no open positions on any known comet — fund + supply first.");
    } catch (e) {
      append(`positions FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [synthetic, evmClient, cfg, append]);

  const runFaucetClaim = useCallback(async () => {
    if (!publicKey || !signTransaction || !synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const programId = new PublicKey(cfg.programId);
      const data = encodeFunctionData({ abi: FAUCET_ABI, functionName: "claim" });
      append(`faucet claim → synthetic (100 wHEAT + 4 mocks + 10 gas, one-time per wallet) — discovering ..`);
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const accounts = await emulateCallAccounts(
        "/api/discovery",
        { from: synthetic, to: FAUCET as Hex, data },
        publicKey.toBase58(),
      );
      const treasure = treasureWallet(programId, cfg.chainId, 0);
      if (!accounts.some((a) => a.pubkey.equals(treasure))) {
        accounts.push({ pubkey: treasure, isSigner: false, isWritable: true });
      }
      const balKey = balanceKeyPda(programId, cfg.chainId, synthetic);
      if (!accounts.some((a) => a.pubkey.equals(balKey))) {
        accounts.push({ pubkey: balKey, isSigner: false, isWritable: true });
      }
      append(`  ↳ claim touches ${accounts.length} accounts (5 wrapper transfers + gas) — ensuring ALT ..`);
      const alt = await ensureAlt(
        accounts.map((a) => a.pubkey),
        { connection, payer: publicKey, signTransaction: (tx: Transaction) => signTransaction(tx) },
        `${synthetic}-faucet`,
        append,
      );
      const gasPrice = await evmClient.getGasPrice();
      const nonce = await evmClient.getTransactionCount({ address: synthetic });
      const rlp = buildUnsignedEip1559Rlp({
        chainId: cfg.chainId,
        nonce: BigInt(nonce),
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice,
        gasLimit: 80_000_000n,
        to: FAUCET as Hex,
        data,
      });
      const dotxIx = buildDoTxUnsigned({ programId, unsignedRlp: rlp, accounts });
      append(`faucet claim: v0 tx over ALT (${alt.state.addresses.length} keys), CU=1.4M — sign ..`);
      const { signature } = await submitV0Instructions(
        [...computeBudgetIxs(1_400_000), dotxIx],
        [alt],
        { connection, feePayer: publicKey, signTransaction: (tx: VersionedTransaction) => signTransaction(tx) },
      );
      append(`faucet claim LANDED  sig=${signature}`);
      await reportStats(connection, signature);
      const wheatBal = (await evmClient.readContract({
        address: WHEAT as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [synthetic],
      })) as bigint;
      append(`  ↳ synthetic wHEAT balance now ${wheatBal}  ${wheatBal > 0n ? "✓ claimed — select wHEAT, then Approve + Supply" : "⚠ check"}`);
    } catch (e) {
      append(`faucet claim FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, synthetic, evmClient, cfg, append, reportStats]);

  const runBorrow = useCallback(async () => {
    if (!publicKey || !signTransaction || !synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const programId = new PublicKey(cfg.programId);
      const base = ASSETS[0]; // wUSDC is the Comet base asset
      const min = (await evmClient.readContract({
        address: cfg.comet as Address,
        abi: COMET_ABI,
        functionName: "baseBorrowMin",
      })) as bigint;
      // withdraw(base, amount) draws down base SUPPLY first, then borrows the
      // remainder as debt. To open a clean `targetDebt` of actual debt, withdraw
      // (existing supply + targetDebt). Needs collateral to back the borrow.
      const baseSupply = (await evmClient.readContract({
        address: cfg.comet as Address,
        abi: COMET_ABI,
        functionName: "balanceOf",
        args: [synthetic],
      })) as bigint;
      const targetDebt = min > 1_000_000n ? min : 1_000_000n; // ≥ baseBorrowMin, default 1 wUSDC debt
      const amount = baseSupply + targetDebt;
      const data = encodeFunctionData({
        abi: COMET_ABI,
        functionName: "withdraw",
        args: [base.address, amount],
      });
      append(`borrow: open ${targetDebt} debt → withdraw(${base.symbol}, ${amount}) (supply ${baseSupply}, baseBorrowMin=${min}) — needs collateral ..`);

      // Borrow touches ~31 accounts (comet + impl + base wrapper + 2 feed
      // adapters + oracle factory, each fanning out to code/storage PDAs) →
      // ~1390 bytes, over Solana's 1232 legacy limit. An ALT compresses the
      // account keys to 1-byte indices so the tx fits. This is intrinsic to a
      // multi-contract EVM borrow, not bloat (verified: 0 dups, 2 read-only
      // Pyth, collateral wrappers not even touched). Two fixes over the earlier
      // ALT attempt: (1) add acct(synthetic) balance_key (ACCOUN_SEED PDA, the
      // nonce) — discovery omits it, which tripped the handler.rs:45 panic;
      // (2) cache the ALT per-Comet so switching Comets can't reuse a stale one.
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const accounts = await emulateCallAccounts(
        "/api/discovery",
        { from: synthetic, to: cfg.comet as Hex, data },
        publicKey.toBase58(),
      );
      const treasure = treasureWallet(programId, cfg.chainId, 0);
      if (!accounts.some((a) => a.pubkey.equals(treasure))) {
        accounts.push({ pubkey: treasure, isSigner: false, isWritable: true });
      }
      const balKey = balanceKeyPda(programId, cfg.chainId, synthetic);
      if (!accounts.some((a) => a.pubkey.equals(balKey))) {
        accounts.push({ pubkey: balKey, isSigner: false, isWritable: true });
      }
      append(`  ↳ borrow touches ${accounts.length} accounts (incl. synthetic balance_key) — ensuring ALT ..`);
      const alt = await ensureAlt(
        accounts.map((a) => a.pubkey),
        { connection, payer: publicKey, signTransaction: (tx: Transaction) => signTransaction(tx) },
        `${synthetic}-${cfg.comet}`,
        append,
      );

      const gasPrice = await evmClient.getGasPrice();
      const nonce = await evmClient.getTransactionCount({ address: synthetic });
      const rlp = buildUnsignedEip1559Rlp({
        chainId: cfg.chainId,
        nonce: BigInt(nonce),
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice,
        gasLimit: 2_000_000n,
        to: cfg.comet as Hex,
        data,
      });
      const dotxIx = buildDoTxUnsigned({ programId, unsignedRlp: rlp, accounts });
      append(`borrow: v0 tx over ALT (${alt.state.addresses.length} keys), CU=1.4M — sign ..`);
      const { signature } = await submitV0Instructions(
        [...computeBudgetIxs(1_400_000), dotxIx],
        [alt],
        { connection, feePayer: publicKey, signTransaction: (tx: VersionedTransaction) => signTransaction(tx) },
      );
      append(`borrow LANDED  sig=${signature}`);
      await reportStats(connection, signature);
      const debt = (await evmClient.readContract({
        address: cfg.comet as Address,
        abi: COMET_ABI,
        functionName: "borrowBalanceOf",
        args: [synthetic],
      })) as bigint;
      const bal = (await evmClient.readContract({
        address: base.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [synthetic],
      })) as bigint;
      append(`  ↳ borrowBalanceOf(synthetic)=${debt}; synthetic ${base.symbol}=${bal}  ${debt > 0n ? "✓ borrowed (debt opened)" : "⚠ check"}`);
    } catch (e) {
      append(`borrow FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, synthetic, evmClient, cfg, append, reportStats]);

  // Repay — Compound v3 has no repay(): supply(base, amount) repays the borrow
  // first, surplus becomes supply. Repay min(debt, walletBalance).
  //
  // Repaying runs the repay-the-debt branch of supply() — which reads the base
  // price feed + accrues interest. Those accounts are NOT surfaced by an amount=0
  // discovery (supply(base,0) does nothing → never enters that branch), so an
  // atomic [approve+supply] bundle (whose supply leg must discover at amount=0,
  // before the in-tx approve sets the allowance) ships a truncated account list
  // and the real repay panics (handler.rs:122, missing account). So repay can't
  // be atomic — it uses the exact-approve-SEPARATE pattern (like buyCollateral):
  // approve EXACTLY `amount` first (live SPL delegate to the comet), then discover
  // the repay at the REAL amount (allowance live → complete account set incl. the
  // feed/accrual accounts), then submit. The repay consumes the delegate in full
  // → residual 0 (read back). 2 popups; the atomic 1-popup isn't reachable because
  // discovery can't see the full repay account set without a live allowance.
  const runRepay = useCallback(async () => {
    if (!synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const comet = cfg.comet as Address;
      const base = ASSETS[0]; // wUSDC is the Comet base asset
      const debt = (await evmClient.readContract({
        address: comet,
        abi: COMET_ABI,
        functionName: "borrowBalanceOf",
        args: [synthetic],
      })) as bigint;
      if (debt === 0n) {
        append("no debt to repay — borrow first");
        return;
      }
      const walletBal = (await evmClient.readContract({
        address: base.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [synthetic],
      })) as bigint;
      const amount = repayAmount(debt, walletBal);
      if (amount === 0n) {
        append(`no ${base.symbol} to repay with (debt=${debt}, wallet=0)`);
        return;
      }
      append(
        `repay: supply(${base.symbol}, ${amount}) toward debt ${debt}` +
          `${amount < debt ? " (partial — wallet short)" : " (full)"} — exact approve (separate), then real-amount repay ..`,
      );
      // 1) approve EXACTLY `amount` (separate tx; cached wrapper sets an SPL
      //    delegate to the comet for this exact amount — no standing approve).
      const allowance = (await evmClient.readContract({
        address: base.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [synthetic, comet],
      })) as bigint;
      if (allowance < amount) {
        const okA = await submitCall(`approve(exact ${amount} ${base.symbol} → comet)`, base.address, encodeApprove(comet, amount));
        if (!okA) return;
      }
      // 2) discover the repay at the REAL amount (allowance now live → full set),
      //    then submit as a single DoTx leg over the shared ALT.
      const repayData = encodeRepay(base.address, amount);
      const leg = { to: comet as Hex, data: repayData, accounts: await discoverAugmented(comet as Hex, repayData) };
      const sig = await submitAtomicBundle([leg], { label: `repay ${base.symbol}`, cuLimit: 1_400_000 });
      if (sig) {
        const after = (await evmClient.readContract({
          address: comet,
          abi: COMET_ABI,
          functionName: "borrowBalanceOf",
          args: [synthetic],
        })) as bigint;
        append(
          `  ↳ borrowBalanceOf(synthetic)=${after}  ` +
            `${after < debt ? "✓ debt reduced" : "⚠ unchanged"}${after === 0n ? " (fully repaid)" : ""}`,
        );
        const residual = (await evmClient.readContract({
          address: base.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [synthetic, comet],
        })) as bigint;
        append(`  ↳ residual allowance(→comet)=${residual}  ${residual === 0n ? "✓ no standing approve" : "⚠ leftover allowance"}`);
      }
    } catch (e) {
      append(`repay FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [synthetic, evmClient, cfg, submitCall, discoverAugmented, submitAtomicBundle, append]);

  // Liquidate — comet.absorb(synthetic, [victim]) seizes an underwater account's
  // collateral and clears its debt (the absorber can later buyCollateral at a
  // discount). absorb walks every one of the victim's collateral positions +
  // their price feeds → many accounts, so (like borrow) it needs the ALT + v0
  // path. Guarded by isLiquidatable so we don't burn a tx on a healthy account.
  const runLiquidate = useCallback(async () => {
    if (!publicKey || !signTransaction || !synthetic) return append("connect Phantom first");
    const victim = liqVictim.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(victim)) {
      return append("enter a victim address (0x… 40 hex) to liquidate");
    }
    setBusy(true);
    try {
      const programId = new PublicKey(cfg.programId);
      const liquidatable = (await evmClient.readContract({
        address: cfg.comet as Address,
        abi: COMET_ABI,
        functionName: "isLiquidatable",
        args: [victim as Address],
      })) as boolean;
      if (!liquidatable) {
        append(`${victim} is NOT liquidatable (healthy) — absorb would revert`);
        return;
      }
      const data = encodeAbsorb(synthetic, [victim as Hex]);
      append(`liquidate: absorb(synthetic, [${victim}]) — discovering accounts ..`);
      const connection = new Connection(solanaRpcUrl, "confirmed");
      const accounts = await emulateCallAccounts(
        "/api/discovery",
        { from: synthetic, to: cfg.comet as Hex, data },
        publicKey.toBase58(),
      );
      const treasure = treasureWallet(programId, cfg.chainId, 0);
      if (!accounts.some((a) => a.pubkey.equals(treasure))) {
        accounts.push({ pubkey: treasure, isSigner: false, isWritable: true });
      }
      const balKey = balanceKeyPda(programId, cfg.chainId, synthetic);
      if (!accounts.some((a) => a.pubkey.equals(balKey))) {
        accounts.push({ pubkey: balKey, isSigner: false, isWritable: true });
      }
      append(`  ↳ absorb touches ${accounts.length} accounts — ensuring ALT ..`);
      const alt = await ensureAlt(
        accounts.map((a) => a.pubkey),
        { connection, payer: publicKey, signTransaction: (tx: Transaction) => signTransaction(tx) },
        `${synthetic}-${cfg.comet}`,
        append,
      );
      const gasPrice = await evmClient.getGasPrice();
      const nonce = await evmClient.getTransactionCount({ address: synthetic });
      const rlp = buildUnsignedEip1559Rlp({
        chainId: cfg.chainId,
        nonce: BigInt(nonce),
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice,
        gasLimit: 2_000_000n,
        to: cfg.comet as Hex,
        data,
      });
      const dotxIx = buildDoTxUnsigned({ programId, unsignedRlp: rlp, accounts });
      append(`liquidate: v0 tx over ALT (${alt.state.addresses.length} keys), CU=1.4M — sign ..`);
      const { signature } = await submitV0Instructions(
        [...computeBudgetIxs(1_400_000), dotxIx],
        [alt],
        { connection, feePayer: publicKey, signTransaction: (tx: VersionedTransaction) => signTransaction(tx) },
      );
      append(`liquidate LANDED  sig=${signature}`);
      await reportStats(connection, signature);
      const stillLiq = (await evmClient.readContract({
        address: cfg.comet as Address,
        abi: COMET_ABI,
        functionName: "isLiquidatable",
        args: [victim as Address],
      })) as boolean;
      append(
        `  ↳ isLiquidatable(${victim})=${stillLiq}  ` +
          `${!stillLiq ? "✓ absorbed (debt cleared)" : "⚠ still liquidatable"}`,
      );
    } catch (e) {
      append(`liquidate FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, synthetic, liqVictim, evmClient, cfg, append, reportStats]);

  // Buy collateral — claim the liquidator reward. After an absorb, the seized
  // collateral sits in the protocol's reserves; the absorber buys it at the
  // storeFront discount (profit = the discount). NO standing approve: the exact
  // baseAmount approve is bundled with buyCollateral into ONE atomic Solana tx
  // (2 DoTxUnsigned, nonce n + n+1), so the allowance only ever exists inside
  // the tx that spends it. Reads back residual allowance (must be 0) to prove
  // it. Discovery uses baseAmount=0 to avoid the no-allowance revert.
  const runBuyCollateral = useCallback(async () => {
    if (!publicKey || !signTransaction || !synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const programId = new PublicKey(cfg.programId);
      const comet = cfg.comet as Address;
      const base = ASSETS[0].address;
      const connection = new Connection(solanaRpcUrl, "confirmed");

      const info0 = (await evmClient.readContract({
        address: comet, abi: COMET_ABI, functionName: "getAssetInfo", args: [0],
      })) as { asset: Address; scale: bigint };
      const collat = info0.asset as Address;
      const dec = Math.round(Math.log10(Number(info0.scale)));

      // One-time prereq: the synthetic needs the collateral ATA to RECEIVE the
      // bought tokens. Heavy (~950K CU) → own tx; moves into Activate once
      // front-loaded.
      const mintHex = (await evmClient.readContract({ address: collat, abi: MINT_ID_ABI, functionName: "mint_id" })) as Hex;
      const mint = new PublicKey(Buffer.from(mintHex.slice(2), "hex"));
      const collatAta = associatedTokenAddress(mint, externalAuthPda(programId, synthetic), TOKEN_PROGRAM);
      if (!(await connection.getAccountInfo(collatAta))) {
        append(`prereq: synthetic collateral ATA missing — creating (one-time) ..`);
        const ok = await submitCall("create collateral ATA", collat, encodeFunctionData({ abi: ENSURE_ATA_ABI, functionName: "ensure_token_account", args: [synthetic] }));
        if (!ok) return;
      }

      const walletBase = (await evmClient.readContract({ address: base, abi: erc20Abi, functionName: "balanceOf", args: [synthetic] })) as bigint;
      const baseAmount = walletBase < 5_000_000n ? walletBase : 5_000_000n;
      if (baseAmount === 0n) { append("no wUSDC to buy collateral with"); return; }

      // Nothing-for-sale pre-check — BEFORE any approve, so we never leave a
      // dangling allowance on a comet with nothing seized. buyCollateral reverts
      // NotForSale when getReserves() >= targetReserves, and InsufficientReserves
      // when the buy exceeds the asset's seized collateral reserves. Collateral is
      // only "for sale" after an absorb (liquidation) — so this comet must have a
      // liquidated victim (the liq comet 0xa084F3e9), not the plain 9-asset one.
      const [reserves, target, collatReserves] = (await Promise.all([
        evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "getReserves" }),
        evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "targetReserves" }),
        evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "getCollateralReserves", args: [collat] }),
      ])) as [bigint, bigint, bigint];
      if (reserves >= 0n && reserves >= target) {
        append(`nothing for sale: reserves ${reserves} ≥ target ${target} (NotForSale). buyCollateral needs a prior absorb — use the liq comet 0xa084F3e9.`);
        return;
      }
      if (collatReserves === 0n) {
        append(`no seized ${collat.slice(0, 10)}… reserves to buy (InsufficientReserves) — nothing absorbed on this comet.`);
        return;
      }
      const quote = (await evmClient.readContract({ address: comet, abi: COMET_ABI, functionName: "quoteCollateral", args: [collat, baseAmount] })) as bigint;
      if (quote > collatReserves) {
        append(`buy too large: quote ${quote} > seized reserves ${collatReserves} (InsufficientReserves) — lower the base amount.`);
        return;
      }
      const minAmount = (quote * 98n) / 100n; // 2% slippage floor
      append(`buyCollateral: ${Number(baseAmount) / 1e6} wUSDC → ~${(Number(quote) / 10 ** dec).toFixed(4)} collat (discount reward) — atomic approve+buy, 1 sign ..`);

      const gasPrice = await evmClient.getGasPrice();
      const fee = { maxFeePerGas: gasPrice, maxPriorityFeePerGas: gasPrice, gasLimit: 2_000_000n };
      const treasure = treasureWallet(programId, cfg.chainId, 0);
      const balKey = balanceKeyPda(programId, cfg.chainId, synthetic);
      const withExtras = (accts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]) => {
        for (const ex of [treasure, balKey]) if (!accts.some((a) => a.pubkey.equals(ex))) accts.push({ pubkey: ex, isSigner: false, isWritable: true });
        return accts;
      };

      // A: exact-amount approve as a SEPARATE tx, consumed in full by the buy →
      // residual 0 (not an infinite standing approve). With the allowance live
      // on-chain, the REAL-amount buyCollateral discovery completes and returns
      // the COMPLETE account set (no baseAmount=0 short-circuit that omitted the
      // feed/transfer accounts → handler.rs:102 panic). [B makes this atomic.]
      const allowance = (await evmClient.readContract({ address: base, abi: erc20Abi, functionName: "allowance", args: [synthetic, comet] })) as bigint;
      if (allowance < baseAmount) {
        const okA = await submitCall(`approve(exact ${Number(baseAmount) / 1e6} wUSDC → comet)`, base, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [comet, baseAmount] }));
        if (!okA) return;
      }

      const buyData = encodeBuyCollateral(collat, minAmount, baseAmount, synthetic);
      const buyAccts = withExtras(await emulateCallAccounts("/api/discovery", { from: synthetic, to: comet as Hex, data: buyData }, publicKey.toBase58()));
      if (!buyAccts.some((a) => a.pubkey.equals(collatAta))) buyAccts.push({ pubkey: collatAta, isSigner: false, isWritable: true });
      append(`  ↳ buyCollateral touches ${buyAccts.length} accts — reusing shared ALT ..`);
      const alt = await ensureAlt(
        buyAccts.map((a) => a.pubkey),
        { connection, payer: publicKey, signTransaction: (tx: Transaction) => signTransaction(tx) },
        `${synthetic}-${comet}`,
        append,
      );
      const nonce = await evmClient.getTransactionCount({ address: synthetic });
      const buyIx = buildDoTxUnsigned({ programId, unsignedRlp: buildUnsignedEip1559Rlp({ chainId: cfg.chainId, nonce: BigInt(nonce), ...fee, to: comet as Hex, data: buyData }), accounts: buyAccts });
      const { signature } = await submitV0Instructions(
        [...computeBudgetIxs(1_400_000), buyIx],
        [alt],
        { connection, feePayer: publicKey, signTransaction: (tx: VersionedTransaction) => signTransaction(tx) },
      );
      append(`buyCollateral LANDED  sig=${signature}`);
      await reportStats(connection, signature);
      const collatBal = (await evmClient.readContract({ address: collat, abi: erc20Abi, functionName: "balanceOf", args: [synthetic] })) as bigint;
      const allowanceAfter = (await evmClient.readContract({ address: base, abi: erc20Abi, functionName: "allowance", args: [synthetic, comet] })) as bigint;
      append(`  ↳ synthetic collateral wallet=${(Number(collatBal) / 10 ** dec).toFixed(4)}  ✓ reward received`);
      append(`  ↳ residual allowance(→comet)=${allowanceAfter}  ${allowanceAfter === 0n ? "✓ no standing approve" : "⚠ leftover allowance"}`);
    } catch (e) {
      append(`buyCollateral FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, synthetic, evmClient, cfg, submitCall, append, reportStats]);

  // PATH 2 — fund + approve + supply in 2 Phantom popups: (1) [fund(native) +
  // approve(exact)] sets balance + allowance, (2) supply discovered at the real
  // amount. Can't be 1 popup: supply's transferFrom accounts only surface at a
  // real amount, which needs the allowance live first (see the inline note).
  const runCombined = useCallback(async () => {
    if (!publicKey || !signTransaction || !synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const programId = new PublicKey(cfg.programId);
      const mintHex = (await evmClient.readContract({
        address: asset.address,
        abi: MINT_ID_ABI,
        functionName: "mint_id",
      })) as Hex;
      const mint = new PublicKey(Buffer.from(mintHex.slice(2), "hex"));
      const extAuth = externalAuthPda(programId, synthetic);
      const toAta = associatedTokenAddress(mint, extAuth, TOKEN_PROGRAM);
      const fromAta = associatedTokenAddress(mint, publicKey, TOKEN_PROGRAM);
      const amount = asset.amount;
      const connection = new Connection(solanaRpcUrl, "confirmed");

      // Prereq 1 — the synthetic's asset ATA must exist (ActivateAta funds INTO
      // it; supply pulls FROM it; it can't be bundled — ~950K CU). Create it in
      // its own tx if missing; skip if present (Activate front-loads all 9).
      const ataInfo = await connection.getAccountInfo(toAta);
      if (!ataInfo) {
        append(`prereq: ${asset.symbol} ATA missing — creating it first ..`);
        const ok = await submitCall(
          `create ${asset.symbol} ATA`,
          asset.address,
          encodeFunctionData({ abi: ENSURE_ATA_ABI, functionName: "ensure_token_account", args: [synthetic] }),
        );
        if (!ok) return;
      }
      const comet = cfg.comet as Address;
      const fundIx = buildActivateAtaInstruction({
        programId,
        chainId: cfg.chainId,
        mint,
        tokens: amount,
        signer: publicKey,
        fromAta,
        toAta,
        tokenProgram: TOKEN_PROGRAM,
      });
      // popup 1: [fund (native ActivateAta) + approve(exact)] — funds the synthetic
      // AND sets the SPL delegate (comet) for precisely `amount`. supply()'s
      // transferFrom accounts only surface at a REAL amount (a 0-amount transfer
      // short-circuits → amount=0 discovery omits the ATAs → handler.rs:122), so
      // the supply must be discovered at the real amount — which needs the balance
      // + allowance live. Hence 2 popups: fund+approve, then supply.
      const approveLeg = {
        to: asset.address as Hex,
        data: encodeApprove(comet, amount),
        accounts: await discoverAugmented(asset.address as Hex, encodeApprove(comet, amount)),
      };
      const sigFA = await submitAtomicBundle([approveLeg], { nativePrefix: [fundIx], label: `fund+approve ${asset.symbol}`, cuLimit: 1_400_000 });
      if (!sigFA) return;
      // popup 2: supply at the REAL amount (balance + allowance live → full set;
      // delegate consumed in full → residual 0).
      const supplyData = encodeFunctionData({ abi: COMET_ABI, functionName: "supply", args: [asset.address, amount] });
      const supplyLeg = { to: comet as Hex, data: supplyData, accounts: await discoverAugmented(comet as Hex, supplyData) };
      const sig = await submitAtomicBundle([supplyLeg], { label: `supply ${asset.symbol}`, cuLimit: 1_400_000 });
      if (!sig) return;
      // Base asset (wUSDC, idx 0) shows in comet.balanceOf; collaterals
      // (wETH/wSOL) show in collateralBalanceOf — balanceOf is base-only.
      if (assetIdx === 0) {
        const bal = (await evmClient.readContract({
          address: cfg.comet as Address,
          abi: COMET_ABI,
          functionName: "balanceOf",
          args: [synthetic],
        })) as bigint;
        append(`  ↳ comet base balanceOf(synthetic)=${bal}  ✓ supplied (fund+approve, then supply)`);
      } else {
        const col = (await evmClient.readContract({
          address: cfg.comet as Address,
          abi: COMET_ABI,
          functionName: "collateralBalanceOf",
          args: [synthetic, asset.address],
        })) as bigint;
        append(`  ↳ comet.collateralBalanceOf(synthetic, ${asset.symbol})=${col}  ${col > 0n ? "✓ supplied" : "✗ zero"}`);
      }
      const residual = (await evmClient.readContract({
        address: asset.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [synthetic, cfg.comet as Address],
      })) as bigint;
      append(`  ↳ residual allowance(→comet)=${residual}  ${residual === 0n ? "✓ no standing approve" : "⚠ leftover allowance"}`);
    } catch (e) {
      append(`combined FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [publicKey, signTransaction, synthetic, evmClient, cfg, asset, assetIdx, submitCall, discoverAugmented, submitAtomicBundle, append]);

  // Audit the RAW emulation report (rome_emulateCallAccounts, #353) for the
  // selected asset: dumps every account the proxy returns for supply(amount=0) /
  // approve / supply(real), with S(igner)/W(ritable) flags, each annotated if it
  // matches a known/derived account. Shows what the report DOES and DOESN'T
  // include (e.g. the proxy omits treasure + balanceKey, and at amount=0 omits
  // the transfer/helper accounts a real transfer needs) — the completeness gap.
  const runInspect = useCallback(async () => {
    if (!publicKey || !synthetic) return append("connect Phantom first");
    setBusy(true);
    try {
      const comet = cfg.comet as Address;
      const programId = new PublicKey(cfg.programId);
      const mintHex = (await evmClient.readContract({ address: asset.address, abi: MINT_ID_ABI, functionName: "mint_id" })) as Hex;
      const mint = new PublicKey(Buffer.from(mintHex.slice(2), "hex"));
      const known: Record<string, string> = {
        [treasureWallet(programId, cfg.chainId, 0).toBase58()]: "treasure(0)",
        [balanceKeyPda(programId, cfg.chainId, synthetic).toBase58()]: "synth balanceKey",
        [externalAuthPda(programId, synthetic).toBase58()]: "synth extAuth PDA",
        [externalAuthPda(programId, comet).toBase58()]: "comet extAuth PDA",
        [associatedTokenAddress(mint, externalAuthPda(programId, synthetic), TOKEN_PROGRAM).toBase58()]: "synth ATA (src)",
        [associatedTokenAddress(mint, externalAuthPda(programId, comet), TOKEN_PROGRAM).toBase58()]: "comet ATA (dst)",
        [mint.toBase58()]: "mint",
        [TOKEN_PROGRAM.toBase58()]: "tokenProgram",
      };
      const dump = async (label: string, to: Hex, data: Hex) => {
        try {
          const accts = await emulateCallAccounts("/api/discovery", { from: synthetic, to, data }, publicKey.toBase58());
          append(`── ${label} → ${accts.length} accounts ──`);
          accts.forEach((a, i) =>
            append(`  [${i}] ${a.pubkey.toBase58()}${a.isSigner ? " S" : ""}${a.isWritable ? " W" : ""}${known[a.pubkey.toBase58()] ? `  ← ${known[a.pubkey.toBase58()]}` : ""}`),
          );
          const present = new Set(accts.map((a) => a.pubkey.toBase58()));
          const missing = Object.entries(known).filter(([k]) => !present.has(k)).map(([, v]) => v);
          append(`  ↳ known accounts NOT in this report: ${missing.length ? missing.join(", ") : "(none)"}`);
        } catch (e) {
          append(`── ${label} → DISCOVERY ERROR: ${(e as Error).message}`);
        }
      };
      append(`INSPECT raw proxy report for ${asset.symbol} (from synthetic ${synthetic.slice(0, 10)}…) ..`);
      await dump(`supply(${asset.symbol}, 0)`, comet as Hex, encodeFunctionData({ abi: COMET_ABI, functionName: "supply", args: [asset.address, 0n] }));
      await dump(`approve(comet, ${asset.amount})`, asset.address as Hex, encodeApprove(comet, asset.amount));
      await dump(`supply(${asset.symbol}, ${asset.amount}) [real]`, comet as Hex, encodeFunctionData({ abi: COMET_ABI, functionName: "supply", args: [asset.address, asset.amount] }));
    } catch (e) {
      append(`inspect FAILED: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [publicKey, synthetic, cfg, asset, evmClient, append]);

  const copyResults = useCallback(() => {
    const md = [
      "# Discovery results — Solana-native Compound lane",
      "",
      `- program: \`${cfg.programId}\`  chainId: ${cfg.chainId}`,
      `- solanaRpc: ${solanaRpcUrl}  discovery: /api/discovery`,
      `- synthetic: \`${synthetic ?? "(not connected)"}\``,
      "",
      "## Log",
      "```",
      ...log,
      "```",
    ].join("\n");
    void navigator.clipboard.writeText(md);
    append("results copied to clipboard as markdown");
  }, [cfg, synthetic, log, append]);

  return (
    <main style={{ maxWidth: 1280, margin: "2rem auto", padding: "0 1rem", fontFamily: "ui-monospace, monospace" }}>
      <h1>Solana-native Compound — discovery probe</h1>
      <p style={{ color: "#888" }}>Dev-only. Proves DoTxUnsigned end-to-end via Phantom.</p>

      <section style={{ margin: "1rem 0", padding: "0.75rem", border: "1px solid #333", borderRadius: 8 }}>
        <div>program: <code>{cfg.programId}</code></div>
        <div>chainId: {cfg.chainId} · solanaRpc: {solanaRpcUrl}</div>
        <div>comet: <code>{cfg.comet || "(set NEXT_PUBLIC_COMET_PROXY)"}</code></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          <span>asset:</span>
          <select
            value={assetIdx}
            onChange={(e) => setAssetIdx(Number(e.target.value))}
            disabled={busy}
            style={{ padding: "4px 8px", borderRadius: 6, background: "#1c1c1c", color: "#ddd", border: "1px solid #555" }}
          >
            {ASSETS.map((a, i) => (
              <option key={a.symbol} value={i}>
                {a.symbol} ({a.address.slice(0, 8)}…) — supply {a.amount.toString()}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <WalletMultiButton />
        <span>synthetic: <code>{synthetic ?? "—"}</code></span>
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginTop: "1rem" }}>
        {/* LEFT — live output + transaction history, sticky so it stays in view
            while the action buttons on the right scroll. */}
        <div style={{ flex: "1 1 0", minWidth: 0, position: "sticky", top: "1rem", alignSelf: "flex-start" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--fg2, #888)" }}>
              Output
            </span>
            <button onClick={() => setLog([])} disabled={!log.length} style={btnStyle(false, !log.length)}>
              Clear log
            </button>
          </div>
          <pre style={{ background: "#111", color: "#0f0", padding: "0.75rem", borderRadius: 8, minHeight: 160, maxHeight: "55vh", overflow: "auto", whiteSpace: "pre-wrap", margin: 0 }}>
            {log.length ? log.join("\n") : "(log)"}
          </pre>
          <section style={{ marginTop: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Solana transactions ({txHistory.length})</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={loadOnChainHistory} disabled={!synthetic || busy} style={btnStyle(true, !synthetic || busy)}>
                  {busy ? "…" : "Load all from chain"}
                </button>
                <button onClick={clearHistory} disabled={!txHistory.length} style={btnStyle(false, !txHistory.length)}>
                  Clear
                </button>
              </div>
            </div>
            {txHistory.length === 0 ? (
              <p style={{ color: "#888" }}>No transactions yet — every landed tx appears here with a Solana-explorer link.</p>
            ) : (
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                {[...txHistory].reverse().map((tx) => (
                  <li key={tx.sig} style={{ marginBottom: 8, lineHeight: 1.5 }}>
                    <span style={{ color: "#888" }}>{tx.t}</span> <span style={{ color: "#ddd" }}>{tx.label}</span>
                    <br />
                    <a
                      href={explorerUrl(tx.sig)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#a78bfa", textDecoration: "none" }}
                    >
                      {tx.sig.slice(0, 10)}…{tx.sig.slice(-10)} ↗ explorer
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        {/* RIGHT — action sections */}
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
      <Section title="Setup">
        <button onClick={readState} disabled={!synthetic} style={btnStyle(false, !synthetic)}>
          Read synthetic state
        </button>
        <button
          onClick={runActivate}
          disabled={!synthetic || busy || !cfg.baseAsset}
          style={btnStyle(true, !synthetic || busy || !cfg.baseAsset)}
        >
          {busy ? "running…" : "1. Activate (PDA + ATA)"}
        </button>
        <button
          onClick={runFund}
          disabled={!synthetic || busy || !cfg.baseAsset}
          style={btnStyle(true, !synthetic || busy || !cfg.baseAsset)}
        >
          {busy ? "running…" : "2. Fund (ActivateAta)"}
        </button>
      </Section>
      <Section title="Supply & Withdraw">
        <button
          onClick={runSupply}
          disabled={!synthetic || busy || !cfg.comet || !cfg.baseAsset}
          style={btnStyle(true, !synthetic || busy || !cfg.comet || !cfg.baseAsset)}
        >
          {busy ? "running…" : `3. Supply ${asset.symbol}`}
        </button>
        <button
          onClick={runWithdraw}
          disabled={!synthetic || busy || !cfg.comet || !cfg.baseAsset}
          style={btnStyle(true, !synthetic || busy || !cfg.comet || !cfg.baseAsset)}
        >
          {busy ? "running…" : `4. Withdraw ${asset.symbol}`}
        </button>
        <button
          onClick={runReturnToWallet}
          disabled={!synthetic || busy || !cfg.baseAsset}
          style={btnStyle(false, !synthetic || busy || !cfg.baseAsset)}
        >
          {busy ? "running…" : `5. Return ${asset.symbol} to wallet`}
        </button>
        <button
          onClick={runWithdrawToWallet}
          disabled={!synthetic || busy || !cfg.comet || !cfg.baseAsset}
          style={btnStyle(true, !synthetic || busy || !cfg.comet || !cfg.baseAsset)}
        >
          {busy ? "running…" : `★ Withdraw ${asset.symbol} → wallet (1 tx)`}
        </button>
      </Section>
      <Section title="Borrow & Repay">
        <button
          onClick={runBorrow}
          disabled={!synthetic || busy || !cfg.comet || !cfg.baseAsset}
          style={btnStyle(true, !synthetic || busy || !cfg.comet || !cfg.baseAsset)}
        >
          {busy ? "running…" : "6. Borrow wUSDC"}
        </button>
        <button
          onClick={runRepay}
          disabled={!synthetic || busy || !cfg.comet || !cfg.baseAsset}
          style={btnStyle(true, !synthetic || busy || !cfg.comet || !cfg.baseAsset)}
        >
          {busy ? "running…" : "7. Repay wUSDC"}
        </button>
      </Section>
      <Section title="Liquidate">
        <input
          value={liqVictim}
          onChange={(e) => setLiqVictim(e.target.value)}
          placeholder="victim 0x… to liquidate"
          spellCheck={false}
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 12,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--border-subtle, #333)",
            background: "var(--bg-surface, #111)",
            color: "var(--fg1, #eee)",
            minWidth: 280,
          }}
        />
        <button
          onClick={runLiquidate}
          disabled={!synthetic || busy || !cfg.comet || !liqVictim.trim()}
          style={btnStyle(true, !synthetic || busy || !cfg.comet || !liqVictim.trim())}
        >
          {busy ? "running…" : "8. Liquidate (absorb)"}
        </button>
        <button
          onClick={runBuyCollateral}
          disabled={!synthetic || busy || !cfg.comet}
          style={btnStyle(true, !synthetic || busy || !cfg.comet)}
        >
          {busy ? "running…" : "9. Buy collateral (claim reward, atomic approve+buy)"}
        </button>
      </Section>
      <Section title="Account & Tools">
        <button
          onClick={runPositions}
          disabled={!synthetic || busy || !cfg.comet}
          style={btnStyle(false, !synthetic || busy || !cfg.comet)}
        >
          {busy ? "running…" : "My Open Positions"}
        </button>
        <button
          onClick={runInspect}
          disabled={!synthetic || busy || !cfg.comet || !cfg.baseAsset}
          style={btnStyle(false, !synthetic || busy || !cfg.comet || !cfg.baseAsset)}
        >
          {busy ? "running…" : `🔍 Inspect emulation report (${asset.symbol})`}
        </button>
        <button
          onClick={runFaucetClaim}
          disabled={!synthetic || busy}
          style={btnStyle(true, !synthetic || busy)}
        >
          {busy ? "running…" : "Claim wHEAT (faucet)"}
        </button>
        <button
          onClick={runCombined}
          disabled={!synthetic || busy || !cfg.comet || !cfg.baseAsset}
          style={btnStyle(true, !synthetic || busy || !cfg.comet || !cfg.baseAsset)}
        >
          {busy ? "running…" : `★ Fund+Approve+Supply ${asset.symbol} (2 tx)`}
        </button>
        <button onClick={copyResults} disabled={log.length === 0} style={btnStyle(false, log.length === 0)}>
          Copy results (md)
        </button>
      </Section>
      {!synthetic && (
        <p style={{ color: "#a00", marginTop: -6 }}>
          Connect Phantom (button above) to enable the actions.
        </p>
      )}
        </div>
      </div>
    </main>
  );
}

// Groups the action buttons under a labeled header so the portal reads as
// Setup / Supply / Borrow / Liquidate / … instead of one flat button wall.
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ margin: "1.25rem 0" }}>
      <div
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--fg2, #888)",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {children}
      </div>
    </div>
  );
}

export default function DiscoveryPage() {
  // Dev-only probe page — 404 in production unless explicitly opted in.
  if (!isDiscoveryEnabled(process.env, { production: process.env.NODE_ENV === "production" })) {
    notFound();
  }
  const cfg = resolveProbeConfig(ENV);
  // Resolve the relative /api/solana-rpc proxy path to an absolute endpoint for
  // the wallet-adapter ConnectionProvider (mirrors providers-solana).
  const endpoint = solanaRpcEndpoint(cfg.solanaRpc, typeof window !== "undefined" ? window.location.origin : "");
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <Probe />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
