// Deploy/config cache-bust hook. revalidateTag throws outside a request context
// (can't run from a deploy shell), so the playbook curls THIS route after a
// comet/registry change. Gated three ways because an unauthenticated hit is a
// 1-POST → N-expensive-proxy-read DoS amplifier: shared-secret (constant-time) +
// chainId allowlist (live registry chains only) + a simple in-process rate limit.

import { revalidateTag } from "next/cache";
import { createHash, timingSafeEqual } from "node:crypto";
import { configForChain } from "@/lib/config";

export const runtime = "nodejs";

// Constant-time compare via fixed-length digests (no length leak, no throw on
// mismatched lengths the way a raw timingSafeEqual would).
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 20;
let hits: number[] = [];
function rateLimited(now = Date.now()): boolean {
  hits = hits.filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) return true;
  hits.push(now);
  return false;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.REVALIDATE_SECRET;
  const provided = req.headers.get("x-revalidate-secret") ?? "";
  // No configured secret OR mismatch → 401 (fail closed). Compared before any work.
  if (!expected || !secretMatches(provided, expected)) {
    return json({ error: "unauthorized" }, 401);
  }
  if (rateLimited()) {
    return json({ error: "rate limited" }, 429);
  }

  let body: { chainId?: unknown } = {};
  try {
    body = (await req.json()) as { chainId?: unknown };
  } catch {
    // empty/invalid body → falls through to the chain guard
  }
  const chainId = Number(body.chainId);
  if (!Number.isFinite(chainId) || !configForChain(chainId)) {
    return json({ error: `unknown chain ${String(body.chainId)}` }, 400);
  }

  revalidateTag(`market:${chainId}`);
  return json({ revalidated: true, chainId });
}
