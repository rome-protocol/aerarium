import { describe, it, expect } from "vitest";
import { explorerTxUrl, explorerAddressUrl } from "../explorer";

const VIA = "https://via-hadrian.testnet.romeprotocol.xyz/";
const VIA_NO_SLASH = "https://via-hadrian.testnet.romeprotocol.xyz";
const HASH = "0xabc123";
const ADDR = "0x3403e0de09bc76ca7d74762f264e4f6b649a0562";

describe("explorerTxUrl", () => {
  it("builds a /tx/ URL from a base WITH a trailing slash (no double slash)", () => {
    expect(explorerTxUrl(VIA, HASH)).toBe(
      "https://via-hadrian.testnet.romeprotocol.xyz/tx/0xabc123",
    );
  });

  it("builds a /tx/ URL from a base WITHOUT a trailing slash", () => {
    expect(explorerTxUrl(VIA_NO_SLASH, HASH)).toBe(
      "https://via-hadrian.testnet.romeprotocol.xyz/tx/0xabc123",
    );
  });

  it("never produces the RPC endpoint as the explorer host", () => {
    // Regression: previously the explorer base was activeConfig.rome.rpc
    // (the proxy path /api/rome-rpc), which yielded /api/rome-rpctx/<hash>.
    const url = explorerTxUrl(VIA, HASH);
    expect(url).not.toContain("/api/rome-rpc");
    expect(url).toContain("via-hadrian");
  });
});

describe("explorerAddressUrl", () => {
  it("builds an /address/ URL with trailing-slash normalization", () => {
    expect(explorerAddressUrl(VIA, ADDR)).toBe(
      `https://via-hadrian.testnet.romeprotocol.xyz/address/${ADDR}`,
    );
    expect(explorerAddressUrl(VIA_NO_SLASH, ADDR)).toBe(
      `https://via-hadrian.testnet.romeprotocol.xyz/address/${ADDR}`,
    );
  });
});
