import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "../route";

describe("GET /api/env", () => {
  const ORIG_ENV = process.env;
  beforeEach(() => {
    process.env = { ...ORIG_ENV };
  });
  afterEach(() => {
    process.env = ORIG_ENV;
  });

  it("returns defaultChainId from NEXT_PUBLIC_DEFAULT_CHAIN_ID", async () => {
    process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID = "200010";
    const res = await GET();
    const body = await res.json();
    expect(body).toMatchObject({ defaultChainId: 200010 });
  });

  it("falls back to DEFAULT_CHAIN_ID env when NEXT_PUBLIC variant is absent", async () => {
    delete process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID;
    process.env.DEFAULT_CHAIN_ID = "200010";
    const res = await GET();
    expect(await res.json()).toMatchObject({ defaultChainId: 200010 });
  });

  it("returns defaultChainId=null when neither env var is set", async () => {
    delete process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID;
    delete process.env.DEFAULT_CHAIN_ID;
    const res = await GET();
    expect(await res.json()).toMatchObject({ defaultChainId: null });
  });

  it("NEXT_PUBLIC_DEFAULT_CHAIN_ID takes precedence over DEFAULT_CHAIN_ID when both set", async () => {
    process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID = "200010";
    process.env.DEFAULT_CHAIN_ID = "30001";
    const res = await GET();
    expect(await res.json()).toMatchObject({ defaultChainId: 200010 });
  });

  it("returns null when env value is not a finite number", async () => {
    process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID = "abc";
    const res = await GET();
    expect(await res.json()).toMatchObject({ defaultChainId: null });
  });

  describe("walletConnectProjectId — runtime env pattern (mirrors the Rome web app)", () => {
    it("returns walletConnectProjectId from WALLETCONNECT_PROJECT_ID server env", async () => {
      process.env.WALLETCONNECT_PROJECT_ID = "abc123";
      const res = await GET();
      const body = await res.json();
      expect(body.walletConnectProjectId).toBe("abc123");
    });

    it("returns walletConnectProjectId='' (empty) when the env var is unset", async () => {
      delete process.env.WALLETCONNECT_PROJECT_ID;
      const res = await GET();
      const body = await res.json();
      expect(body.walletConnectProjectId).toBe("");
    });

    it("WALLETCONNECT_PROJECT_ID stays SERVER-ONLY (no NEXT_PUBLIC_ leak)", async () => {
      // Asserts the route doesn't accidentally also read a NEXT_PUBLIC_* form,
      // which would re-introduce build-time inlining.
      delete process.env.WALLETCONNECT_PROJECT_ID;
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = "should-be-ignored";
      const res = await GET();
      const body = await res.json();
      expect(body.walletConnectProjectId).toBe("");
    });
  });
});
