// Thin client for the Rome Via indexer (rome-via-api). The front page is
// server-rendered, so this runs server-side (server→server fetch, no CORS).
// Two reads: the comet's tx list (method / from / origination — the `/txs` list
// omits amounts) and per-tx logs (`/txs/<hash>` — for the $ amounts via
// decodeTransfers). Best-effort by default: any failure yields empty data, never
// throws, so a flaky indexer degrades the dashboard to preview rather than
// crashing it. Pass { strict: true } for the cache path, where a failure MUST
// throw so unstable_cache caches nothing (vs caching an error-[] as truth for
// the whole revalidate window).

import type { RawLog } from "./decode";

export interface IndexerTx {
  hash: string;
  method: string | null;
  from: string;
  to: string;
  origination: string;
  timestamp: string;
  solanaLegs?: { solChain: string; solSignature: string }[];
}

export interface IndexerClient {
  /** All txs to/from `comet`, oldest-cap `max`, following cursor pagination. */
  listCometTxs(comet: string, opts?: { limit?: number; max?: number }): Promise<IndexerTx[]>;
  /** Decoded `logs[]` for a tx hash (empty if absent / unreachable). */
  txLogs(hash: string): Promise<RawLog[]>;
}

// Minimal fetch surface this client uses (URL in, ok/status/json out). Narrower
// than `typeof fetch` so a plain test fake satisfies it; global `fetch` does too.
interface MinimalResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}
type FetchLike = (url: string | URL) => Promise<MinimalResponse>;

interface TxListEnvelope {
  items?: IndexerTx[];
  nextCursor?: string | null;
  hasMore?: boolean;
}

export function createIndexerClient(baseUrl: string, fetchImpl: FetchLike = fetch, clientOpts: { strict?: boolean } = {}): IndexerClient {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    async listCometTxs(comet, opts = {}) {
      const limit = opts.limit ?? 100;
      const max = opts.max ?? 500;
      const all: IndexerTx[] = [];
      let cursor: string | null = null;
      try {
        for (let i = 0; i < 50 && all.length < max; i++) {
          const q = new URLSearchParams({ limit: String(limit) });
          if (cursor) q.set("cursor", cursor);
          const res = await fetchImpl(`${root}/addresses/${comet}/txs?${q.toString()}`);
          if (!res.ok) {
            if (clientOpts.strict) throw new Error(`indexer ${res.status} for ${comet} txs`);
            break;
          }
          const body = (await res.json()) as TxListEnvelope;
          for (const it of body.items ?? []) all.push(it);
          if (!body.hasMore || !body.nextCursor) break;
          cursor = body.nextCursor;
        }
      } catch (e) {
        if (clientOpts.strict) throw e;
        // best-effort — return whatever we gathered
      }
      return all.slice(0, max);
    },
    async txLogs(hash) {
      try {
        const res = await fetchImpl(`${root}/txs/${hash}`);
        if (!res.ok) {
          if (clientOpts.strict) throw new Error(`indexer ${res.status} for tx ${hash}`);
          return [];
        }
        const body = (await res.json()) as { logs?: RawLog[] };
        return body.logs ?? [];
      } catch (e) {
        if (clientOpts.strict) throw e;
        return [];
      }
    },
  };
}
