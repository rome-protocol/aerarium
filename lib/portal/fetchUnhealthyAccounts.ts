// Client-agnostic unhealthy-account discovery for Compound v3 (Comet).
//
// Extracted from useUnhealthyAccounts so BOTH lanes can share one scan: the
// EVM lane passes wagmi's PublicClient, the Solana lane passes its own
// /api/rome-rpc viem client (useSolanaActions.evmClient). The logic — scan a
// recent block window of Supply events → dedupe candidate addresses → probe
// each via comet.isLiquidatable, keep the liquidatable ones — is identical to
// what the hook did inline; only the client is now injected.
//
// Kept free of React / wagmi so it's unit-testable and reusable.
//
// NOTE (log gap): Rome does NOT surface Solana-native (DoTxUnsigned) txs as
// EVM logs, so this event-scan only sees EVM-origin Supply activity. Accounts
// that opened their position from the Solana lane are invisible here — the
// shared LiquidateView keeps a manual-address entry to absorb those.
import type { Address } from "viem";

/**
 * How far back to scan for candidate addresses. Capped at 10 blocks: a wide
 * eth_getLogs range is pathologically heavy on the Rome proxy (a 10K window
 * fired on every page load AND every 30s per open tab hammered it with GBs of
 * log reads). The durable fix is the rome-via indexer path
 * (getCachedLiquidatable, no getLogs); this bound keeps the brute scan
 * negligible until that lands.
 */
export const SCAN_BLOCKS = 10n;

// Compound v3 emits Supply / SupplyCollateral / Withdraw events tagged with
// the src/from address. We scan a window of recent blocks to collect
// candidates, then probe each via comet.isLiquidatable.
export const COMET_LOG_ABI = [
  {
    type: "event",
    name: "Supply",
    inputs: [
      { type: "address", name: "from", indexed: true },
      { type: "address", name: "dst", indexed: true },
      { type: "uint256", name: "amount" },
    ],
  },
] as const;

export const COMET_ISLIQUIDATABLE_ABI = [
  {
    type: "function",
    name: "isLiquidatable",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Minimal viem-PublicClient surface fetchUnhealthyAccounts needs. Both
 *  wagmi's `usePublicClient()` and the Solana lane's `evmClient` satisfy it. */
export interface UnhealthyScanClient {
  getBlockNumber: () => Promise<bigint>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLogs: (args: any) => Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readContract: (args: any) => Promise<unknown>;
}

export interface FetchUnhealthyOpts {
  /** Block window to scan back from the chain head. Default SCAN_BLOCKS. */
  scanBlocks?: bigint;
}

/**
 * Scan recent Comet activity for accounts with positions, then probe each via
 * comet.isLiquidatable. Returns a deduped list of liquidatable addresses.
 *
 * Read-only — no signer required. `client` is any viem PublicClient.
 */
export async function fetchUnhealthyAccounts(
  client: UnhealthyScanClient,
  comet: Address,
  opts: FetchUnhealthyOpts = {},
): Promise<Address[]> {
  const scanBlocks = opts.scanBlocks ?? SCAN_BLOCKS;

  // Scan recent Supply events for candidate addresses.
  const latest = await client.getBlockNumber();
  const fromBlock = latest > scanBlocks ? latest - scanBlocks : 0n;
  const logs = await client.getLogs({
    address: comet,
    event: COMET_LOG_ABI[0],
    fromBlock,
    toBlock: latest,
  });

  // Dedup candidate addresses (Supply taggs `from`; tolerate `src` shape too).
  const seen = new Set<string>();
  const candidates: Address[] = [];
  for (const log of logs as unknown as Array<{ args: { from?: Address; src?: Address } }>) {
    const src = (log.args.from ?? log.args.src) as Address | undefined;
    if (!src) continue;
    const k = src.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    candidates.push(src);
  }

  // Probe each candidate via isLiquidatable; keep the liquidatable ones.
  const liquidatable: Address[] = [];
  await Promise.all(
    candidates.map(async (acc) => {
      const ok = (await client.readContract({
        address: comet,
        abi: COMET_ISLIQUIDATABLE_ABI,
        functionName: "isLiquidatable",
        args: [acc],
      })) as boolean;
      if (ok) liquidatable.push(acc);
    }),
  );
  return liquidatable;
}
