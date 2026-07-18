import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { scanText } from "../check-no-committed-secrets";

// Fake keys are generated at runtime so this test file never itself
// contains a committed key-shaped literal (which would trip the very
// scanner it tests, plus GitGuardian).
const fakeHexKey = () => "0x" + randomBytes(32).toString("hex");
const fakeSolanaKeypair = () =>
  "[" + Array.from(randomBytes(64)).join(",") + "]";

describe("scanText — committed-secret guard", () => {
  it("flags an EVM private key assigned in *_PRIVATE_KEY context", () => {
    const src = `NEXT_PUBLIC_MOCK_WALLET_PRIVATE_KEY: '${fakeHexKey()}'`;
    const f = scanText(src);
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe("evm-private-key");
  });

  it("flags an EVM key even when the *_PK name and value are on separate lines", () => {
    // matches the real playwright.config.ts shape that leaked
    const src = `const HADRIAN_TESTUSER_PK =\n  "${fakeHexKey()}";`;
    expect(scanText(src)).toHaveLength(1);
  });

  it("flags a Solana keypair JSON byte-array", () => {
    const f = scanText(`const kp = ${fakeSolanaKeypair()};`);
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe("solana-keypair");
  });

  it("does NOT flag a 32-byte event-signature hash (no key context)", () => {
    // real fixture pattern from lib/market/**/__tests__
    const src = `const TRANSFER_SIG = "${fakeHexKey()}";`;
    expect(scanText(src)).toHaveLength(0);
  });

  it("does NOT flag calldata / topics 64-hex without key context", () => {
    const src = `topics: ["${fakeHexKey()}"], data: "${fakeHexKey()}"`;
    expect(scanText(src)).toHaveLength(0);
  });

  it("does NOT flag a short numeric array (not a keypair)", () => {
    expect(scanText(`const rgb = [255, 128, 0];`)).toHaveLength(0);
  });
});
