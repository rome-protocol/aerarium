// Cache for a Comet's IMMUTABLE shape (baseToken, price feeds, per-asset
// configs). These only change on a Comet redeploy, which mints a new address —
// so keying by chainId+comet makes the cache self-invalidating. Seeding a hook
// from here renders the asset list instantly and lets dependent reads (prices,
// balances, user positions) start without first paying the numAssets +
// getAssetInfo round-trips. Scoped to sessionStorage (per-tab), best-effort.

import type { CometMarket } from "./hooks/useCometMarket";

const VERSION = "v1";
const PREFIX = `aer:market:${VERSION}:`;

// In-memory fallback for SSR and environments without sessionStorage
// (Safari private mode throws on access; Node test env has no window).
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

function keyFor(chainId: number | string, comet: string): string {
  return `${PREFIX}${chainId}:${comet.toLowerCase()}`;
}

// Markets carry bigints (scale, collateral factors, supplyCap); JSON can't
// serialize them natively, so tag-and-revive.
function replacer(_k: string, v: unknown): unknown {
  return typeof v === "bigint" ? { __bigint: v.toString() } : v;
}
function reviver(_k: string, v: unknown): unknown {
  if (v && typeof v === "object" && typeof (v as { __bigint?: unknown }).__bigint === "string") {
    return BigInt((v as { __bigint: string }).__bigint);
  }
  return v;
}

export function readMarketCache(chainId: number | string, comet: string): CometMarket | null {
  try {
    const raw = backend().get(keyFor(chainId, comet));
    if (!raw) return null;
    return JSON.parse(raw, reviver) as CometMarket;
  } catch {
    return null;
  }
}

export function writeMarketCache(
  chainId: number | string,
  comet: string,
  market: CometMarket,
): void {
  try {
    backend().set(keyFor(chainId, comet), JSON.stringify(market, replacer));
  } catch {
    /* quota / private mode — caching is best-effort, never block a read */
  }
}

export function clearMarketCache(): void {
  try {
    const b = backend();
    for (const k of b.keys()) if (k.startsWith(PREFIX)) b.remove(k);
  } catch {
    /* ignore */
  }
}
