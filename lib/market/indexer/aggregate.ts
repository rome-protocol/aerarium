// Pure aggregations over indexed comet txs (+ their decoded Transfer logs) into
// the activity-derived pool fields. "Liquidity" = base-asset flow: a supply tx
// moves base user→comet; a base withdraw moves base comet→user (treated as
// borrow). Split by origination (ecdsa = EVM lane, anything else = Solana lane).
// Amounts are converted to USD by the caller-supplied `usdValue` (it owns the
// on-chain price + decimals).

import type { IndexerTx } from "./client";
import type { TransferEvent } from "./decode";

export interface PoolActivity {
  suppliers: number;
  suppliedEvm: number;
  suppliedSol: number;
  borrowedEvm: number;
  borrowedSol: number;
}

interface AggInput {
  txs: IndexerTx[];
  transfersByHash: Record<string, TransferEvent[]>;
  comet: string;
  baseToken: string;
  usdValue: (token: string, rawAmount: bigint) => number;
}

const lane = (origination: string): "evm" | "sol" => (origination === "ecdsa" ? "evm" : "sol");
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function aggregatePoolActivity(input: AggInput): PoolActivity {
  const { txs, transfersByHash, comet, baseToken, usdValue } = input;
  const suppliers = new Set<string>();
  let suppliedEvm = 0;
  let suppliedSol = 0;
  let borrowedEvm = 0;
  let borrowedSol = 0;

  for (const tx of txs) {
    const method = tx.method ?? "";
    const transfers = transfersByHash[tx.hash] ?? [];
    const l = lane(tx.origination);
    if (method.startsWith("supply")) {
      suppliers.add(tx.from.toLowerCase());
      for (const t of transfers) {
        if (eq(t.token, baseToken) && eq(t.to, comet)) {
          const usd = usdValue(baseToken, t.amount);
          if (l === "evm") suppliedEvm += usd;
          else suppliedSol += usd;
        }
      }
    } else if (method.startsWith("withdraw")) {
      for (const t of transfers) {
        if (eq(t.token, baseToken) && eq(t.from, comet)) {
          const usd = usdValue(baseToken, t.amount);
          if (l === "evm") borrowedEvm += usd;
          else borrowedSol += usd;
        }
      }
    }
  }

  return { suppliers: suppliers.size, suppliedEvm, suppliedSol, borrowedEvm, borrowedSol };
}
