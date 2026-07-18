import { describe, it, expect } from "vitest";
import { resolveRomeRpcUpstream } from "@/lib/romeRpc";
import { getCompoundConfig } from "@/lib/registry";
import { resolveDefaultChainId } from "@/lib/config";

describe("resolveRomeRpcUpstream", () => {
  it("uses ROME_RPC_UPSTREAM when set", () => {
    expect(resolveRomeRpcUpstream({ ROME_RPC_UPSTREAM: "https://x" })).toBe("https://x");
  });

  it("uses NEXT_PUBLIC_ROME_RPC as a secondary override", () => {
    expect(resolveRomeRpcUpstream({ NEXT_PUBLIC_ROME_RPC: "https://pub" })).toBe("https://pub");
  });

  it("falls back to the active chain's registry RPC (not a hardcoded URL)", () => {
    const def = getCompoundConfig(resolveDefaultChainId())!;
    expect(resolveRomeRpcUpstream({})).toBe(def.rpcUrl);
  });

  it("throws a clear error when neither env nor a registry RPC is available", () => {
    expect(() => resolveRomeRpcUpstream({}, 999999)).toThrow(/RPC upstream/i);
  });
});
