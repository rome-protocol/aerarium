// Activity-feed event parsing for the Compound portal.
//
// Decodes Comet's Supply / Withdraw / SupplyCollateral / WithdrawCollateral
// events into UI-friendly ActivityEntry records.  The hook that fetches
// raw logs (useRecentActivity) lives in lib/portal/hooks/.

import {
  keccak256,
  toBytes,
  type AbiEvent,
  type Log,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import type { ActivityEntryTimed } from "./groupByDay";

export const COMET_EVENT_TOPICS = {
  supply: keccak256(toBytes("Supply(address,address,uint256)")),
  withdraw: keccak256(toBytes("Withdraw(address,address,uint256)")),
  supplyCollateral: keccak256(toBytes("SupplyCollateral(address,address,address,uint256)")),
  withdrawCollateral: keccak256(toBytes("WithdrawCollateral(address,address,address,uint256)")),
} as const;

export type ActivityKind = "supply" | "withdraw" | "supplyCollateral" | "withdrawCollateral";

export interface ActivityEntry {
  kind: ActivityKind;
  /** "base" for Supply/Withdraw of the base asset; lowercased asset address for collat events. */
  asset: "base" | string;
  /** Raw amount in the asset's smallest unit. */
  amount: bigint;
  txHash: Hex;
  blockNumber: bigint;
  /** logIndex within the block, used for stable ordering across logs in the same tx. */
  logIndex: number;
  /** Counterparty address for the "from" or "to" leg, lowercased. */
  counterparty?: string;
}

function topicToAddress(topic: Hex): string {
  // Topics are 32 bytes; addresses occupy the trailing 20.
  return "0x" + topic.slice(-40).toLowerCase();
}

function topicToAmount(data: Hex): bigint {
  return BigInt(data);
}

/**
 * Parse one Comet log into an ActivityEntry.  Returns null when:
 *  - the topic isn't one of the four Comet events we surface, OR
 *  - neither indexed participant matches `user` (filter is OR — we surface
 *    both outbound and inbound activity touching the user).
 */
export function parseActivityLog(log: Log, user: Address): ActivityEntry | null {
  const topic0 = log.topics[0] as Hex | undefined;
  if (!topic0) return null;

  const userLower = user.toLowerCase();
  const kind = topicKindFor(topic0);
  if (!kind) return null;

  const t1 = log.topics[1] as Hex | undefined;
  const t2 = log.topics[2] as Hex | undefined;
  if (!t1 || !t2) return null;

  const from = topicToAddress(t1);
  const to = topicToAddress(t2);
  if (from !== userLower && to !== userLower) return null;

  const counterparty = from === userLower ? to : from;

  // Asset comes from topic3 for collat events, otherwise it's the base.
  let asset: ActivityEntry["asset"] = "base";
  if (kind === "supplyCollateral" || kind === "withdrawCollateral") {
    const t3 = log.topics[3] as Hex | undefined;
    if (!t3) return null;
    asset = topicToAddress(t3);
  }

  return {
    kind,
    asset,
    amount: topicToAmount(log.data as Hex),
    txHash: log.transactionHash as Hex,
    blockNumber: log.blockNumber as bigint,
    logIndex: Number(log.logIndex ?? 0),
    counterparty,
  };
}

function topicKindFor(topic: Hex): ActivityKind | null {
  if (topic === COMET_EVENT_TOPICS.supply) return "supply";
  if (topic === COMET_EVENT_TOPICS.withdraw) return "withdraw";
  if (topic === COMET_EVENT_TOPICS.supplyCollateral) return "supplyCollateral";
  if (topic === COMET_EVENT_TOPICS.withdrawCollateral) return "withdrawCollateral";
  return null;
}

// The four Comet events whose logs we surface as recent activity. Used by
// fetchRecentActivity's getLogs calls (one per event, in parallel).
export const COMET_EVENTS: AbiEvent[] = [
  {
    type: "event",
    name: "Supply",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "dst", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "src", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SupplyCollateral",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "dst", type: "address", indexed: true },
      { name: "asset", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "WithdrawCollateral",
    inputs: [
      { name: "src", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "asset", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
];

// Truncated to 10 blocks: a wide getLogs window (4 events × 5K blocks) on every
// activity fetch hammered the Rome proxy with GBs of log reads. The rome-via
// indexer path (getCachedActivity) is the durable full-history feed with NO
// getLogs; this bound keeps the on-chain scan negligible until that lands.
const DEFAULT_LOOKBACK_BLOCKS = 10n;
const DEFAULT_MAX_ENTRIES = 12;

/**
 * Fetch the most-recent user-touching Comet activity over a rolling block
 * window, decoded + enriched with block timestamps. Client-agnostic: works with
 * any viem PublicClient (wagmi's usePublicClient OR a hand-built createPublicClient
 * over a custom transport such as the Solana lane's /api/rome-rpc client).
 *
 * Flow (lifted verbatim from the original useRecentActivity hook):
 *   getBlockNumber → parallel getLogs over the 4 COMET_EVENTS for the window →
 *   parseActivityLog (filter to user) → sort by block desc then logIndex desc →
 *   slice maxEntries → dedupe blocks → getBlock for timestamps → ActivityEntryTimed[].
 */
export async function fetchRecentActivity(
  client: PublicClient,
  comet: Address,
  user: Address,
  opts?: { lookbackBlocks?: bigint; maxEntries?: number },
): Promise<ActivityEntryTimed[]> {
  const lookbackBlocks = opts?.lookbackBlocks ?? DEFAULT_LOOKBACK_BLOCKS;
  const maxEntries = opts?.maxEntries ?? DEFAULT_MAX_ENTRIES;

  const head = await client.getBlockNumber();
  const from = head > lookbackBlocks ? head - lookbackBlocks : 0n;

  // Pull each event type in parallel.  Each call returns logs touching
  // ANY user — we filter to ours in-process via parseActivityLog.
  const allLogs = await Promise.all(
    COMET_EVENTS.map((event) =>
      client.getLogs({
        address: comet,
        event,
        fromBlock: from,
        toBlock: head,
      }),
    ),
  );

  const parsed: ActivityEntry[] = [];
  for (const logs of allLogs) {
    for (const log of logs) {
      const entry = parseActivityLog(log, user);
      if (entry) parsed.push(entry);
    }
  }

  parsed.sort((a, b) => {
    const blockDiff = Number(b.blockNumber - a.blockNumber);
    if (blockDiff !== 0) return blockDiff;
    return b.logIndex - a.logIndex;
  });

  const top = parsed.slice(0, maxEntries);

  // Enrich with block timestamps. Dedupe block numbers first so we make at most
  // one eth_getBlockByNumber per unique block (typical: 5-10 unique per load).
  const uniqueBlocks = Array.from(
    new Set(top.map((e) => e.blockNumber.toString())),
  ).map((s) => BigInt(s));
  const blockTimestamps = new Map<string, number>();
  await Promise.all(
    uniqueBlocks.map(async (bn) => {
      try {
        const block = await client.getBlock({ blockNumber: bn });
        blockTimestamps.set(bn.toString(), Number(block.timestamp));
      } catch {
        // Leave unset — callers fall back to wall-clock so the feed never
        // crashes on a missing block.
      }
    }),
  );

  return top.map((e) => ({
    ...e,
    timestamp:
      blockTimestamps.get(e.blockNumber.toString()) ?? Math.floor(Date.now() / 1000),
  }));
}
