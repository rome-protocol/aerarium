/**
 * Server-side proxy for the Solana RPC the Solana-native lane submits to.
 *
 * Same rationale as /api/rome-rpc + /api/discovery: the browser POSTs the
 * DoTxUnsigned (getLatestBlockhash → sendRawTransaction → getSignatureStatuses,
 * all plain JSON-RPC over HTTP — no WebSocket, see lib/solana/submit.ts) to
 * this same-origin route, and the route forwards verbatim server-side to the
 * RPC. The DoTxUnsigned no longer goes browser→Solana directly.
 *
 * Why a proxy and not /api/env: the Solana RPC is a PRIVATE endpoint. Routing
 * it through /api/env (or the registry) would disclose the URL to the client at
 * runtime; this route keeps SOLANA_RPC purely server-side — it never reaches
 * the bundle, /api/env, or the browser's network tab. One image runs against
 * any environment by swapping the deploy-time SOLANA_RPC in .env.
 *
 * Upstream is resolved from SOLANA_RPC (set by the deploy config), falling back
 * to NEXT_PUBLIC_SOLANA_RPC then the public devnet endpoint for local dev.
 * Production requires SOLANA_RPC at boot (validateEnv).
 */

import { resolveSolanaRpcUpstream } from "@/lib/solanaRpc";

export async function POST(req: Request) {
  // Forward verbatim — the client's serializer is authoritative; parsing here
  // adds no value and risks dropping batch requests / hex precision.
  const body = await req.text();
  const upstream = await fetch(resolveSolanaRpcUpstream(process.env), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });
  // Mirror upstream status + body. No CORS headers — same-origin means the
  // browser doesn't ask for them; this route IS the RPC from its perspective.
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
