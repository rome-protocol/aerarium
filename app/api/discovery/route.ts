/**
 * Server-side proxy for the Rome account-discovery RPC (rome_emulateCallAccounts,
 * the Rome proxy #353). Same rationale as /api/rome-rpc: a browser tab can't POST
 * cross-origin to the discovery proxy (CORS), so the client points at this
 * same-origin route and the route forwards verbatim server-side.
 *
 * Kept as its own knob, separate from /api/rome-rpc, though the deployed rome
 * Proxy now serves rome_emulateCallAccounts (the Rome proxy #362): for a single_state
 * chain the public RPC endpoint IS the proxy, so DISCOVERY_PROXY_UPSTREAM can be
 * the chain's RPC host. Falls back to a locally-run proxy (:9090) in dev.
 * Discovery is read-only and off the tx path; the DoTxUnsigned itself submits to
 * the Solana RPC directly.
 */

const UPSTREAM =
  process.env.DISCOVERY_PROXY_UPSTREAM ??
  process.env.NEXT_PUBLIC_DISCOVERY_PROXY_URL ??
  "http://localhost:9090";

export async function POST(req: Request) {
  const body = await req.text();
  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
