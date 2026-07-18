// Shared market endpoint: composes the three chainId-keyed cached reads into one
// payload. N users × M tabs collapse to ~1 upstream read per tier per revalidate
// window (the cache fns own the revalidate; this route has NO segment-level
// revalidate). The raw ReserveReads bigints are serialized via the bigint codec
// so the EVM lane's capacity math survives the JSON boundary exactly.

import { getCachedMarket, getCachedActivity, getCachedLiquidatable } from "@/lib/market/cachedMarket";
import { configForChain } from "@/lib/config";
import { serializeBigints } from "@/lib/market/bigintJson";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ chainId: string }> }) {
  const { chainId: chainIdStr } = await params;
  const chainId = Number(chainIdStr);
  // Guard: unknown / non-numeric chain → 400 (never read against a bad chain).
  if (!Number.isFinite(chainId) || !configForChain(chainId)) {
    return new Response(JSON.stringify({ error: `unknown chain ${chainIdStr}` }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const [state, activity, liquidatable] = await Promise.all([
    getCachedMarket(chainId),
    getCachedActivity(chainId),
    getCachedLiquidatable(chainId),
  ]);

  return new Response(serializeBigints({ state, activity, liquidatable }), {
    headers: { "content-type": "application/json" },
  });
}
