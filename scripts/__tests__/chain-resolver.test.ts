import { describe, it, expect } from "vitest";
// _chain.mjs is the chain-config resolver the dev probe scripts share. The
// literals below are the Hadrian (200010) values from lib/registry/generated.json
// (#240 wrapper set); asserting the resolver reproduces them proves it reads the
// committed registry projection. (This file is skipped by the no-chain-literals guard.)
import { resolveChain } from "../_chain.mjs";

describe("resolveChain", () => {
  const c = resolveChain("200010");

  it("resolves chain id, rpc, comet, base, and program from config", () => {
    expect(c.CHAIN_ID).toBe(200010);
    expect(c.EVM).toBe("https://hadrian.testnet.romeprotocol.xyz/");
    expect(c.COMET).toBe("0xfc322489D4089AdCC79074C8058Fd257c63622D8");
    expect(c.BASE).toBe("0xd4cc34b67c805d472b5a709a22a1037f6b16ef28");
    expect(c.PROGRAM).toBe("RPTWwELXAY4KC9ZPHhaxp7Sq1hHtU3HNEgLbSegCcWf");
  });

  it("maps every asset symbol (base + collaterals) to its address", () => {
    expect(c.ASSET_ADDR.wUSDC).toBe("0xd4cc34b67c805d472b5a709a22a1037f6b16ef28");
    expect(c.ASSET_ADDR.wETH).toBe("0x8c2c1486cadf7d07312908a065f14af65f56be7e");
    expect(c.ASSET_ADDR.wSOL).toBe("0x1dece035621c65a90349b56a801068b439fa4201");
    expect(c.ASSET_ADDR.wBTC).toBe("0xd3200df5e6f5e37fdba0275bb63dca1b22506760");
  });

  it("exposes the faucet token list from config", () => {
    expect(c.cfg.faucet.tokens.map((t: { symbol: string }) => t.symbol)).toEqual([
      "wBTC",
      "wJitoSOL",
      "wmSOL",
      "wJUP",
      "wJTO",
      "wBONK",
    ]);
  });

  it("throws a helpful error naming the unknown chain id", () => {
    expect(() => resolveChain("999999")).toThrow(/999999/);
  });
});
