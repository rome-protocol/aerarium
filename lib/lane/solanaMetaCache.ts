// Reconnect cache for the Solana lane's IMMUTABLE asset metadata (symbol /
// decimals / price feed / collateral factor per asset). This shape only changes
// on a Comet redeploy, which mints a new comet address — so keying by the comet
// address makes the cache self-invalidating (a redeploy is a cache miss). Seeding
// `assetMetas` from here on reconnect lets the position read start immediately
// instead of first paying the numAssets + getAssetInfo + symbol/decimals
// round-trips (~3 sequential ~1s reads). Best-effort, per-tab (sessionStorage).
//
// Mirrors lib/portal/marketCache.ts (the EVM lane's equivalent). The on-chain
// enumeration still runs and overwrites, so a hit only speeds the first paint.

import type { Address } from "viem";
import type { SolanaPositionMeta } from "./solanaReads";

const VERSION = "v1";
const PREFIX = `aer:sol-meta:${VERSION}:`;

// In-memory fallback for SSR / Safari private mode / Node test env.
const memory = new Map<string, string>();

interface KV {
  get(k: string): string | null;
  set(k: string, v: string): void;
  remove(k: string): void;
  keys(): string[];
}

function backend(): KV {
  if (typeof window !== "undefined") {
    try {
      const ss = window.sessionStorage;
      const probe = "__aer_probe__";
      ss.setItem(probe, "1");
      ss.removeItem(probe);
      return {
        get: (k) => ss.getItem(k),
        set: (k, v) => ss.setItem(k, v),
        remove: (k) => ss.removeItem(k),
        keys: () => Object.keys(ss),
      };
    } catch {
      /* private mode / disabled — fall through to memory */
    }
  }
  return {
    get: (k) => memory.get(k) ?? null,
    set: (k, v) => {
      memory.set(k, v);
    },
    remove: (k) => {
      memory.delete(k);
    },
    keys: () => [...memory.keys()],
  };
}

function keyFor(comet: string): string {
  return `${PREFIX}${comet.toLowerCase()}`;
}

// borrowCollateralFactorE18 is a bigint; JSON can't serialize it natively.
function replacer(_k: string, v: unknown): unknown {
  return typeof v === "bigint" ? { __bigint: v.toString() } : v;
}
function reviver(_k: string, v: unknown): unknown {
  if (v && typeof v === "object" && typeof (v as { __bigint?: unknown }).__bigint === "string") {
    return BigInt((v as { __bigint: string }).__bigint);
  }
  return v;
}

export function readSolanaMetaCache(comet: Address | string): SolanaPositionMeta[] | null {
  try {
    const raw = backend().get(keyFor(comet));
    if (!raw) return null;
    return JSON.parse(raw, reviver) as SolanaPositionMeta[];
  } catch {
    return null;
  }
}

export function writeSolanaMetaCache(comet: Address | string, metas: SolanaPositionMeta[]): void {
  try {
    backend().set(keyFor(comet), JSON.stringify(metas, replacer));
  } catch {
    /* quota / private mode — caching is best-effort, never block a read */
  }
}

export function clearSolanaMetaCache(): void {
  try {
    const b = backend();
    for (const k of b.keys()) if (k.startsWith(PREFIX)) b.remove(k);
  } catch {
    /* ignore */
  }
}
