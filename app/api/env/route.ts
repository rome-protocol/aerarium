import { NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // never cache — server-side env reads

// Runtime env endpoint. Returns server-side configuration the browser
// needs but that shouldn't be baked into the build (build-time
// NEXT_PUBLIC_* inlining ties the image to one set of values; this
// route lets one image run anywhere). Mirrors the Rome web app's pattern.
//
// Fields:
//   defaultChainId           — number | null. Resolves NEXT_PUBLIC_DEFAULT_CHAIN_ID
//                              (legacy build-time pin), falling back to DEFAULT_CHAIN_ID
//                              (runtime env).
//   walletConnectProjectId   — string. Sourced from server-side WALLETCONNECT_PROJECT_ID
//                              (deliberately NOT NEXT_PUBLIC_, so it can't be
//                              accidentally inlined into the client bundle at build
//                              time). Empty string when unset; consumers fall back to
//                              the placeholder.
export async function GET() {
  const raw =
    process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ??
    process.env.DEFAULT_CHAIN_ID ??
    null;
  const parsed = raw === null ? null : Number(raw);
  const defaultChainId = parsed !== null && Number.isFinite(parsed) ? parsed : null;
  const walletConnectProjectId = process.env.WALLETCONNECT_PROJECT_ID ?? "";
  return NextResponse.json({ defaultChainId, walletConnectProjectId });
}
