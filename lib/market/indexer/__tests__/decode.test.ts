import { describe, it, expect } from "vitest";
import { decodeTransfers, type RawLog } from "../decode";

// ERC20 Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (addr: string) => "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");

const WUSDC = "0x9a8b4cb7326033d72ca393c6b4c0d7fb904fa900";
const FROM = "0x3403e0de09bc76ca7d74762f264e4f6b649a0562";
const TO = "0x771d2f213b4c23f70fa884d441a405f41f51ab50";

const transferLog: RawLog = {
  address: WUSDC,
  topics: [TRANSFER_SIG, pad(FROM), pad(TO)],
  data: "0x00000000000000000000000000000000000000000000000000000000000f4240", // 1_000_000
};

// A non-Transfer log (e.g. Comet Supply event) — must be skipped, not throw.
const otherLog: RawLog = {
  address: TO,
  topics: ["0x1234567890abcdef000000000000000000000000000000000000000000000000"],
  data: "0x",
};

describe("decodeTransfers", () => {
  it("decodes ERC20 Transfer logs to {token, from, to, amount}", () => {
    const out = decodeTransfers([transferLog]);
    expect(out).toHaveLength(1);
    expect(out[0].token.toLowerCase()).toBe(WUSDC);
    expect(out[0].from.toLowerCase()).toBe(FROM);
    expect(out[0].to.toLowerCase()).toBe(TO);
    expect(out[0].amount).toBe(1_000_000n);
  });

  it("skips non-Transfer logs without throwing", () => {
    const out = decodeTransfers([transferLog, otherLog]);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(1_000_000n);
  });

  it("returns [] for empty / undefined logs", () => {
    expect(decodeTransfers([])).toEqual([]);
    expect(decodeTransfers(undefined)).toEqual([]);
  });
});
