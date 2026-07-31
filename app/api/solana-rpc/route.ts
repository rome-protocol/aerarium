/**
 * Server-side proxy for the Solana RPC the Solana-native lane submits to.
 *
 * Same rationale as /api/rome-rpc + /api/discovery: the browser POSTs the
 * DoTxUnsigned (getLatestBlockhash → sendRawTransaction → getSignatureStatuses,
 * all plain JSON-RPC over HTTP — no WebSocket, see lib/solana/submit.ts) to
 * this same-origin route, and the route forwards verbatim server-side to the
 * RPC. The DoTxUnsigned no longer goes browser→Solana directly.
 *
 * Why a proxy and not /api/env: the Solana RPCs are PRIVATE/keyed endpoints.
 * This route keeps SOLANA_RPC + SOLANA_RPC_INDEXED_URL purely server-side —
 * they never reach the bundle, /api/env, or the browser's network tab. One
 * image runs against any environment by swapping the deploy-time env.
 *
 * Method-aware tier failover (lib/solanaRpc.resolveSolanaRpcTiers):
 *   point reads / tx submit: SOLANA_RPC (self-hosted) → SOLANA_RPC_INDEXED_URL → public
 *   scan-class (the flows page's getTokenAccountsByOwner stranded-asset check):
 *                            SOLANA_RPC_INDEXED_URL → public — NEVER self-hosted,
 *     which is unindexed and serves an owner scan as a full token-program sweep
 *     that keeps running after client disconnect (2026-07-24 devnet RPC wedge).
 * Failover advances on connect error / timeout / 429 / 5xx only; a JSON-RPC
 * application error (200 + error body) is an answer and is mirrored.
 */

import { resolveSolanaRpcTiers, isScanPayload } from "@/lib/solanaRpc";

// Scans on an indexed endpoint are sub-second but can carry large result
// sets; point reads are sub-second everywhere, so a short cap keeps failover
// snappy when the self-hosted tier is down.
const SCAN_TIMEOUT_MS = 30_000;
const POINT_READ_TIMEOUT_MS = 8_000;

export async function POST(req: Request) {
  // Forward verbatim — the client's serializer is authoritative; the parse
  // below is used ONLY to classify the method for tier selection, and an
  // unparseable body degrades to the point-read chain.
  const body = await req.text();
  let scan = false;
  try {
    scan = isScanPayload(JSON.parse(body));
  } catch {
    // Not JSON we recognize — treat as point-read traffic.
  }

  const timeoutMs = scan ? SCAN_TIMEOUT_MS : POINT_READ_TIMEOUT_MS;

  for (const upstream of resolveSolanaRpcTiers(process.env, scan)) {
    let response: Response;
    try {
      response = await fetch(upstream, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // Connect error / timeout — next tier. Don't log the message: it can
      // carry the keyed upstream hostname.
      console.error("solana-rpc proxy: tier unreachable, failing over");
      continue;
    }

    if (response.status === 429 || response.status >= 500) {
      console.error(`solana-rpc proxy: tier returned ${response.status}, failing over`);
      continue;
    }

    // Mirror upstream status + body. No CORS headers — same-origin means the
    // browser doesn't ask for them; this route IS the RPC from its perspective.
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  // Every tier failed. Generic body — no upstream hostnames or errors.
  return new Response(JSON.stringify({ error: "Failed to reach Solana RPC" }), {
    status: 502,
    headers: { "content-type": "application/json" },
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
