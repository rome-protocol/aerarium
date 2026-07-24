import { describe, it, expect } from "vitest";
import {
  resolveSolanaRpcUpstream,
  resolveSolanaRpcTiers,
  isScanPayload,
  PUBLIC_DEVNET_RPC,
} from "@/lib/solanaRpc";
import { resolveDefaultChainId } from "@/lib/config";
import solanaRpcMap from "@/lib/registry/generated.solana-rpc.json";

// The Solana RPC the same-origin /api/solana-rpc proxy forwards to, resolved
// SERVER-SIDE from the server-only generated.solana-rpc.json map — never the
// client-bundled generated.json (#72). Precedence:
//   1. SOLANA_RPC env — the operator's (possibly private) override
//   2. NEXT_PUBLIC_SOLANA_RPC — legacy dev override
//   3. the active chain's server-only registry rpc (#189/#190)
//   4. PUBLIC_DEVNET_RPC — dev fallback when the chain declares none
const RPC_MAP = solanaRpcMap as Record<string, string>;

describe("resolveSolanaRpcUpstream", () => {
  it("uses SOLANA_RPC when set (wins over the per-chain map)", () => {
    expect(resolveSolanaRpcUpstream({ SOLANA_RPC: "https://private.rpc" }, 200010)).toBe(
      "https://private.rpc",
    );
  });

  it("uses NEXT_PUBLIC_SOLANA_RPC as a secondary (legacy dev) override", () => {
    expect(resolveSolanaRpcUpstream({ NEXT_PUBLIC_SOLANA_RPC: "https://pub.rpc" }, 200010)).toBe(
      "https://pub.rpc",
    );
  });

  it("SOLANA_RPC takes precedence over NEXT_PUBLIC_SOLANA_RPC", () => {
    expect(
      resolveSolanaRpcUpstream(
        { SOLANA_RPC: "https://private.rpc", NEXT_PUBLIC_SOLANA_RPC: "https://pub.rpc" },
        200010,
      ),
    ).toBe("https://private.rpc");
  });

  it("resolves the active chain's RPC from the server-only map when no env override (per-chain correctness)", () => {
    // Driven from the generated map rather than a hardcoded chain id, so a chain
    // dropping out of the snapshot (e.g. once retired) can't stale this fixture.
    const mappedIds = Object.keys(RPC_MAP);
    expect(mappedIds.length).toBeGreaterThan(0);
    for (const id of mappedIds) {
      expect(RPC_MAP[id]).toBeTruthy();
      expect(resolveSolanaRpcUpstream({}, Number(id))).toBe(RPC_MAP[id]);
    }
  });

  it("falls back to PUBLIC_DEVNET_RPC for an unknown chain (not in the map)", () => {
    expect(RPC_MAP["999999"]).toBeUndefined();
    expect(resolveSolanaRpcUpstream({}, 999999)).toBe(PUBLIC_DEVNET_RPC);
  });

  it("defaults to the default chain's mapped rpc when no chainId is passed", () => {
    const def = resolveDefaultChainId();
    expect(resolveSolanaRpcUpstream({})).toBe(RPC_MAP[String(def)] ?? PUBLIC_DEVNET_RPC);
  });

  it("treats an empty-string env var as unset (falls through to the map/public)", () => {
    expect(resolveSolanaRpcUpstream({ SOLANA_RPC: "" }, 999999)).toBe(PUBLIC_DEVNET_RPC);
  });
});

// Method-aware failover tiers. Scan-class calls (getTokenAccountsByOwner on
// the flows page) NEVER get the self-hosted tier — on an unindexed node an
// owner scan is a full token-program sweep that keeps running server-side
// after client disconnect (the 2026-07-24 devnet RPC wedge class).
describe("resolveSolanaRpcTiers", () => {
  const ENV = {
    SOLANA_RPC: "https://internal.rpc",
    SOLANA_RPC_INDEXED_URL: "https://indexed.rpc",
  };

  it("point reads: self-hosted → indexed → public", () => {
    expect(resolveSolanaRpcTiers(ENV, false, 200010)).toEqual([
      "https://internal.rpc",
      "https://indexed.rpc",
      PUBLIC_DEVNET_RPC,
    ]);
  });

  it("scans: indexed → public — self-hosted tier excluded", () => {
    expect(resolveSolanaRpcTiers(ENV, true, 200010)).toEqual([
      "https://indexed.rpc",
      PUBLIC_DEVNET_RPC,
    ]);
  });

  it("scans without an indexed endpoint go straight to public (never internal)", () => {
    expect(resolveSolanaRpcTiers({ SOLANA_RPC: "https://internal.rpc" }, true, 200010)).toEqual([
      PUBLIC_DEVNET_RPC,
    ]);
  });

  it("dedupes tiers when the operator points both vars at the same URL", () => {
    const env = { SOLANA_RPC: "https://same.rpc", SOLANA_RPC_INDEXED_URL: "https://same.rpc" };
    expect(resolveSolanaRpcTiers(env, false, 200010)).toEqual([
      "https://same.rpc",
      PUBLIC_DEVNET_RPC,
    ]);
  });
});

describe("isScanPayload", () => {
  it("classifies getTokenAccountsByOwner as scan-class", () => {
    expect(isScanPayload({ jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner" })).toBe(true);
  });

  it("classifies getProgramAccounts as scan-class", () => {
    expect(isScanPayload({ jsonrpc: "2.0", id: 1, method: "getProgramAccounts" })).toBe(true);
  });

  it("classifies point reads and tx submission as non-scan", () => {
    for (const method of ["getAccountInfo", "getMultipleAccounts", "getLatestBlockhash", "sendTransaction", "getSignatureStatuses"]) {
      expect(isScanPayload({ jsonrpc: "2.0", id: 1, method })).toBe(false);
    }
  });

  it("treats a batch as scan-class when ANY entry is a scan", () => {
    expect(
      isScanPayload([
        { jsonrpc: "2.0", id: 1, method: "getAccountInfo" },
        { jsonrpc: "2.0", id: 2, method: "getTokenAccountsByOwner" },
      ]),
    ).toBe(true);
  });

  it("tolerates malformed payloads as non-scan", () => {
    expect(isScanPayload(null)).toBe(false);
    expect(isScanPayload("nonsense")).toBe(false);
    expect(isScanPayload([{}])).toBe(false);
  });
});
