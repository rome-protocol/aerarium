import { describe, it, expect } from "vitest";
import { validateEnv, assertMockWalletSafe } from "../env";

describe("validateEnv", () => {
  // Production deploys must set the Solana-lane endpoints; tests that exercise a
  // production-valid env include them so the new prod gates (below) are met.
  const PROD_SOLANA_ENV = {
    SOLANA_RPC: "https://private.rpc",
    DISCOVERY_PROXY_UPSTREAM: "http://disc:9090",
  };

  it("is permissive outside production — registry provides the default chain + RPC", () => {
    const v = validateEnv({}, { production: false });
    expect(v.defaultChainId).toBeNull();
    expect(v.romeRpcUpstream).toBeNull();
    // Solana-lane endpoints are optional outside production (proxy routes fall
    // back to the public devnet RPC / localhost discovery for local dev).
    expect(v.solanaRpc).toBeNull();
    expect(v.discoveryProxyUpstream).toBeNull();
  });

  it("requires an explicit default chain pin in production", () => {
    expect(() => validateEnv({ ...PROD_SOLANA_ENV }, { production: true })).toThrow(/DEFAULT_CHAIN_ID/);
    expect(
      validateEnv(
        { ...PROD_SOLANA_ENV, NEXT_PUBLIC_DEFAULT_CHAIN_ID: "200010" },
        { production: true },
      ).defaultChainId,
    ).toBe(200010);
  });

  it("surfaces the RPC upstream override (ROME_RPC_UPSTREAM or NEXT_PUBLIC_ROME_RPC)", () => {
    expect(
      validateEnv(
        { ...PROD_SOLANA_ENV, NEXT_PUBLIC_DEFAULT_CHAIN_ID: "1", ROME_RPC_UPSTREAM: "https://up" },
        { production: true },
      ).romeRpcUpstream,
    ).toBe("https://up");
    expect(
      validateEnv({ NEXT_PUBLIC_ROME_RPC: "https://pub" }, { production: false }).romeRpcUpstream,
    ).toBe("https://pub");
  });

  it("requires SOLANA_RPC in production (the private RPC the /api/solana-rpc proxy forwards to)", () => {
    expect(() =>
      validateEnv(
        { NEXT_PUBLIC_DEFAULT_CHAIN_ID: "200010", DISCOVERY_PROXY_UPSTREAM: "http://disc:9090" },
        { production: true },
      ),
    ).toThrow(/SOLANA_RPC/);
  });

  it("requires DISCOVERY_PROXY_UPSTREAM in production (it silently defaults to localhost:9090 otherwise)", () => {
    expect(() =>
      validateEnv(
        { NEXT_PUBLIC_DEFAULT_CHAIN_ID: "200010", SOLANA_RPC: "https://private.rpc" },
        { production: true },
      ),
    ).toThrow(/DISCOVERY_PROXY_UPSTREAM/);
  });

  it("surfaces SOLANA_RPC + DISCOVERY_PROXY_UPSTREAM when all prod requirements are met", () => {
    const v = validateEnv(
      { ...PROD_SOLANA_ENV, NEXT_PUBLIC_DEFAULT_CHAIN_ID: "200010" },
      { production: true },
    );
    expect(v.solanaRpc).toBe("https://private.rpc");
    expect(v.discoveryProxyUpstream).toBe("http://disc:9090");
  });

  it("does NOT accept NEXT_PUBLIC_SOLANA_RPC for the prod gate (it would inline a private URL into the bundle)", () => {
    expect(() =>
      validateEnv(
        {
          NEXT_PUBLIC_DEFAULT_CHAIN_ID: "200010",
          NEXT_PUBLIC_SOLANA_RPC: "https://leaky.rpc",
          DISCOVERY_PROXY_UPSTREAM: "http://disc:9090",
        },
        { production: true },
      ),
    ).toThrow(/SOLANA_RPC/);
  });

  it("throws when a provided chain id is not a finite number", () => {
    expect(() =>
      validateEnv({ NEXT_PUBLIC_DEFAULT_CHAIN_ID: "abc" }, { production: false }),
    ).toThrow(/chain id/i);
  });

  it("rejects mock-wallet enabled in production (validateEnv path)", () => {
    expect(() =>
      validateEnv({ NEXT_PUBLIC_DEFAULT_CHAIN_ID: "1", NEXT_PUBLIC_MOCK_WALLET: "1" }, {
        production: true,
      }),
    ).toThrow(/mock wallet/i);
  });
});

describe("assertMockWalletSafe", () => {
  it("throws in production when mock wallet is enabled", () => {
    expect(() => assertMockWalletSafe({ NEXT_PUBLIC_MOCK_WALLET: "1" }, { production: true }))
      .toThrow(/mock wallet/i);
  });

  it("throws in production when a mock private key is present", () => {
    expect(() =>
      assertMockWalletSafe({ NEXT_PUBLIC_MOCK_WALLET_PRIVATE_KEY: "0xabc" }, { production: true }),
    ).toThrow(/mock wallet/i);
  });

  it("allows mock wallet outside production", () => {
    expect(() =>
      assertMockWalletSafe({ NEXT_PUBLIC_MOCK_WALLET: "1", NEXT_PUBLIC_MOCK_WALLET_PRIVATE_KEY: "0xabc" }, {
        production: false,
      }),
    ).not.toThrow();
  });

  it("allows production with no mock wallet vars", () => {
    expect(() => assertMockWalletSafe({}, { production: true })).not.toThrow();
  });
});
