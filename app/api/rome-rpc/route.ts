/**
 * Server-side proxy for the Rome JSON-RPC endpoint.
 *
 * Why: the Rome RPC's nginx returns 405 on the CORS preflight (OPTIONS)
 * and emits no Access-Control-Allow-Origin headers on POST. So a browser
 * tab cannot read chain state directly — every `comet.balanceOf`,
 * `userBasic`, `totalSupply`, `getUtilization`, etc. call silently
 * fails the preflight and the position card stays at "—".
 *
 * Fix: client points its public-RPC at this same-origin route. The
 * route runs server-side — no preflight, no CORS — and forwards the
 * JSON-RPC body verbatim to the upstream.
 *
 * Upstream is sourced from `ROME_RPC_UPSTREAM` (server-only env, set by
 * the deploy config), with `NEXT_PUBLIC_ROME_RPC` as a fallback so dev
 * works out of the box. The `NEXT_PUBLIC_*` value would historically be
 * a pure-client hint, but here it's read from `process.env` server-side
 * which is fine — Next.js exposes it on both sides.
 *
 * Pass-through scope: POST only, application/json only. Anything else
 * gets 405. Body is forwarded as-is so any new RPC method works
 * without code changes here.
 */

import { resolveRomeRpcUpstream } from "@/lib/romeRpc";

export async function POST(req: Request) {
  // Forward verbatim. Don't parse — the client's serializer is
  // authoritative, and parsing here adds no value (and risks dropping
  // batch requests, hex precision, etc.).
  const body = await req.text();
  const upstream = await fetch(resolveRomeRpcUpstream(process.env), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    // Disable Next.js fetch caching — RPC responses are state-dependent.
    cache: "no-store",
  });
  // Mirror upstream status + body. Don't add CORS headers — same-origin
  // means the browser doesn't ask for them. The route-handler IS the
  // chain client from the browser's perspective.
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}

// Tell the runtime nothing here is cacheable.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
