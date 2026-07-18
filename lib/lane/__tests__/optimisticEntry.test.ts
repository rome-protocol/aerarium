// Tests for optimisticEntry (laneActivity.ts).
//
// optimisticEntry maps a just-submitted, successful lane action into the same
// presentational ActivityItem[] shape toLaneActivity produces — so the adapter
// can prepend a "just now" row the instant an action confirms, WITHOUT waiting
// on the (EVM) log feed or papering over the (Solana) feed that can't surface
// DoTxUnsigned events at all. It is the structural source of the success
// confirmation + the populated activity feed.

import { describe, it, expect } from "vitest";
import { mergeActivity, optimisticEntry } from "../laneActivity";
import type { ActivityItem } from "@/components/aerarium/lane/types";

describe("optimisticEntry — verb mapping", () => {
  it("maps each ActionType to its past-tense verb", () => {
    const base = { amountUsd: 1, sym: "wUSDC", nowMs: 1_000 };
    expect(optimisticEntry({ ...base, type: "supply" }).verb).toBe("Supplied");
    expect(optimisticEntry({ ...base, type: "withdraw" }).verb).toBe("Withdrew");
    expect(optimisticEntry({ ...base, type: "borrow" }).verb).toBe("Borrowed");
    expect(optimisticEntry({ ...base, type: "repay" }).verb).toBe("Repaid");
  });
});

describe("optimisticEntry — fields", () => {
  it("carries amountUsd as the amount and the sym verbatim", () => {
    const it1 = optimisticEntry({ type: "supply", amountUsd: 1234.5, sym: "wETH", nowMs: 1_000 });
    expect(it1.amount).toBe(1234.5);
    expect(it1.sym).toBe("wETH");
  });

  it("renders time as 'just now'", () => {
    const it1 = optimisticEntry({ type: "borrow", amountUsd: 10, sym: "wUSDC", nowMs: 42 });
    expect(it1.time).toBe("just now");
  });

  it("builds an id namespaced to the optimistic source + nowMs (stable, collision-resistant)", () => {
    const it1 = optimisticEntry({ type: "supply", amountUsd: 10, sym: "wUSDC", nowMs: 1717000000000 });
    expect(it1.id).toBe("optimistic-1717000000000");
  });

  it("passes txUrl through when present", () => {
    const it1 = optimisticEntry({
      type: "withdraw",
      amountUsd: 5,
      sym: "wUSDC",
      txUrl: "https://explorer.example/tx/0xabc",
      nowMs: 1_000,
    });
    expect(it1.txUrl).toBe("https://explorer.example/tx/0xabc");
  });

  it("leaves txUrl undefined when omitted", () => {
    const it1 = optimisticEntry({ type: "repay", amountUsd: 5, sym: "wUSDC", nowMs: 1_000 });
    expect(it1.txUrl).toBeUndefined();
  });
});

describe("optimisticEntry — distinct ids across rapid actions", () => {
  it("two entries built at different nowMs get different ids", () => {
    const a = optimisticEntry({ type: "supply", amountUsd: 1, sym: "wUSDC", nowMs: 1_000 });
    const b = optimisticEntry({ type: "supply", amountUsd: 1, sym: "wUSDC", nowMs: 2_000 });
    expect(a.id).not.toBe(b.id);
  });
});

const item = (id: string | number, over: Partial<ActivityItem> = {}): ActivityItem => ({
  id,
  time: "just now",
  verb: "Supplied",
  amount: 1,
  sym: "wUSDC",
  ...over,
});

describe("mergeActivity", () => {
  it("prepends optimistic entries before the fetched feed", () => {
    const out = mergeActivity([item("optimistic-2"), item("optimistic-1")], [item("0xabc-0"), item("0xdef-1")]);
    expect(out.map((i) => i.id)).toEqual(["optimistic-2", "optimistic-1", "0xabc-0", "0xdef-1"]);
  });

  it("de-dupes by id (optimistic wins over a same-id fetched dup)", () => {
    const out = mergeActivity([item("dup", { verb: "Borrowed" })], [item("dup", { verb: "Supplied" }), item("0xabc-0")]);
    expect(out.map((i) => i.id)).toEqual(["dup", "0xabc-0"]);
    expect(out[0].verb).toBe("Borrowed"); // the optimistic one survived
  });

  it("caps the merged list (default 10)", () => {
    const opt = Array.from({ length: 6 }, (_, i) => item(`optimistic-${i}`));
    const fetched = Array.from({ length: 20 }, (_, i) => item(`0x${i}-0`));
    expect(mergeActivity(opt, fetched)).toHaveLength(10);
  });

  it("honours a custom cap", () => {
    const opt = Array.from({ length: 3 }, (_, i) => item(`optimistic-${i}`));
    expect(mergeActivity(opt, [], 2)).toHaveLength(2);
  });
});
