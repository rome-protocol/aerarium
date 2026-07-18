// Failing tests for activity event parsers (P4).
// Fails today because lib/portal/activity.ts does not exist.

import { describe, it, expect } from "vitest";
import {
  parseActivityLog,
  type ActivityEntry,
  COMET_EVENT_TOPICS,
} from "../activity";
import type { Log } from "viem";

// Comet event sigs (keccak-256 of event signature):
//   Supply(address indexed from, address indexed dst, uint256 amount)
//   Withdraw(address indexed src, address indexed to, uint256 amount)
//   SupplyCollateral(address indexed from, address indexed dst, address indexed asset, uint256 amount)
//   WithdrawCollateral(address indexed src, address indexed to, address indexed asset, uint256 amount)
//   Transfer(address indexed from, address indexed to, uint256 amount)

const USER = "0x6ba69E148C7ab4cb1d2A833De3B7f4B2889cB7Ad" as const;
const COMET = "0x10731DF2488ed1f7aA4D39E04235358C99C7c9F0" as const;
const PCOL = "0x113A5f117D6E5324921d0434ade49a0659B67795" as const;

function pad32(addrOrInt: string | bigint): `0x${string}` {
  if (typeof addrOrInt === "bigint") {
    return ("0x" + addrOrInt.toString(16).padStart(64, "0")) as `0x${string}`;
  }
  const hex = addrOrInt.startsWith("0x") ? addrOrInt.slice(2) : addrOrInt;
  return ("0x" + hex.padStart(64, "0").toLowerCase()) as `0x${string}`;
}

describe("COMET_EVENT_TOPICS", () => {
  it("exposes the four event-topic hashes by name", () => {
    expect(COMET_EVENT_TOPICS.supply).toMatch(/^0x[a-f0-9]{64}$/);
    expect(COMET_EVENT_TOPICS.withdraw).toMatch(/^0x[a-f0-9]{64}$/);
    expect(COMET_EVENT_TOPICS.supplyCollateral).toMatch(/^0x[a-f0-9]{64}$/);
    expect(COMET_EVENT_TOPICS.withdrawCollateral).toMatch(/^0x[a-f0-9]{64}$/);
  });
});

describe("parseActivityLog — Supply", () => {
  it("decodes Supply(from, dst, amount)", () => {
    const amount = 100n * 10n ** 6n;
    const log = {
      address: COMET,
      topics: [
        COMET_EVENT_TOPICS.supply,
        pad32(USER),
        pad32(USER),
      ],
      data: pad32(amount),
      blockNumber: 1188n,
      transactionHash: "0x9248deadbeef" as `0x${string}`,
      logIndex: 0,
      blockHash: "0x" as `0x${string}`,
      transactionIndex: 0,
      removed: false,
    } as unknown as Log;
    const entry = parseActivityLog(log, USER);
    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe<ActivityEntry["kind"]>("supply");
    expect(entry!.amount).toBe(amount);
    expect(entry!.asset).toBe("base");
    expect(entry!.txHash).toBe("0x9248deadbeef");
    expect(entry!.blockNumber).toBe(1188n);
  });
});

describe("parseActivityLog — Withdraw", () => {
  it("decodes Withdraw(src, to, amount)", () => {
    const amount = 25n * 10n ** 6n;
    const log = {
      address: COMET,
      topics: [
        COMET_EVENT_TOPICS.withdraw,
        pad32(USER),
        pad32(USER),
      ],
      data: pad32(amount),
      blockNumber: 1200n,
      transactionHash: "0xabcd1234" as `0x${string}`,
      logIndex: 0,
      blockHash: "0x" as `0x${string}`,
      transactionIndex: 0,
      removed: false,
    } as unknown as Log;
    const entry = parseActivityLog(log, USER);
    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe<ActivityEntry["kind"]>("withdraw");
    expect(entry!.amount).toBe(amount);
    expect(entry!.asset).toBe("base");
  });
});

describe("parseActivityLog — SupplyCollateral", () => {
  it("decodes SupplyCollateral(from, dst, asset, amount) and extracts asset addr", () => {
    const amount = 10n ** 18n;
    const log = {
      address: COMET,
      topics: [
        COMET_EVENT_TOPICS.supplyCollateral,
        pad32(USER),
        pad32(USER),
        pad32(PCOL),
      ],
      data: pad32(amount),
      blockNumber: 1188n,
      transactionHash: "0x9248deadbeef" as `0x${string}`,
      logIndex: 1,
      blockHash: "0x" as `0x${string}`,
      transactionIndex: 0,
      removed: false,
    } as unknown as Log;
    const entry = parseActivityLog(log, USER);
    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe<ActivityEntry["kind"]>("supplyCollateral");
    expect(entry!.amount).toBe(amount);
    expect(entry!.asset).toBe(PCOL.toLowerCase());
  });
});

describe("parseActivityLog — filter by user", () => {
  it("returns null when neither indexed addr matches the user", () => {
    const otherUser = "0xdead000000000000000000000000000000000000" as const;
    const log = {
      address: COMET,
      topics: [
        COMET_EVENT_TOPICS.supply,
        pad32(otherUser),
        pad32(otherUser),
      ],
      data: pad32(100n),
      blockNumber: 1188n,
      transactionHash: "0xff" as `0x${string}`,
      logIndex: 0,
      blockHash: "0x" as `0x${string}`,
      transactionIndex: 0,
      removed: false,
    } as unknown as Log;
    expect(parseActivityLog(log, USER)).toBeNull();
  });

  it("returns the entry when EITHER indexed addr matches the user (someone else supplied TO us)", () => {
    const someoneElse = "0xbeef000000000000000000000000000000000000" as const;
    const log = {
      address: COMET,
      topics: [
        COMET_EVENT_TOPICS.supply,
        pad32(someoneElse),
        pad32(USER),
      ],
      data: pad32(50n),
      blockNumber: 1188n,
      transactionHash: "0xee" as `0x${string}`,
      logIndex: 0,
      blockHash: "0x" as `0x${string}`,
      transactionIndex: 0,
      removed: false,
    } as unknown as Log;
    const entry = parseActivityLog(log, USER);
    expect(entry).not.toBeNull();
    expect(entry!.kind).toBe("supply");
  });
});

describe("parseActivityLog — unknown topic", () => {
  it("returns null for non-Comet-event logs", () => {
    const log = {
      address: COMET,
      topics: [("0x" + "00".repeat(32)) as `0x${string}`],
      data: "0x" as `0x${string}`,
      blockNumber: 1n,
      transactionHash: "0x" as `0x${string}`,
      logIndex: 0,
      blockHash: "0x" as `0x${string}`,
      transactionIndex: 0,
      removed: false,
    } as unknown as Log;
    expect(parseActivityLog(log, USER)).toBeNull();
  });
});
