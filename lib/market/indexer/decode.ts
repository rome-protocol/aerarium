// Decode ERC20 Transfer logs out of an indexer tx-detail `logs[]`. Comet
// supply/withdraw/borrow/absorb txs move the underlying wrappers, so the
// Transfer events carry the real token amounts the dashboard's $ aggregates
// need (the `/txs` list omits amounts; only `/txs/<hash>` returns logs).

import { decodeEventLog, erc20Abi, type Address, type Hex } from "viem";

export interface RawLog {
  address: string;
  topics: string[];
  data: string;
}

export interface TransferEvent {
  token: Address;
  from: Address;
  to: Address;
  amount: bigint;
}

/** Decode every ERC20 Transfer in `logs`; non-Transfer / unparseable logs are skipped. */
export function decodeTransfers(logs: RawLog[] | undefined | null): TransferEvent[] {
  if (!logs?.length) return [];
  const out: TransferEvent[] = [];
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: erc20Abi,
        data: (log.data || "0x") as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "Transfer") continue;
      const { from, to, value } = decoded.args as { from: Address; to: Address; value: bigint };
      out.push({ token: log.address as Address, from, to, amount: value });
    } catch {
      // not an ERC20 Transfer (unknown topic0 / shape) — skip
    }
  }
  return out;
}
