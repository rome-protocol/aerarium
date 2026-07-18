import { describe, it, expect } from "vitest";
import { aggregatePoolActivity } from "../aggregate";
import type { IndexerTx } from "../client";
import type { TransferEvent } from "../decode";

const COMET = "0xcomet";
const BASE = "0xbase";
const USER_A = "0xAAA";
const USER_B = "0xBBB";

const tEvent = (token: string, from: string, to: string, amount: bigint): TransferEvent => ({
  token: token as `0x${string}`,
  from: from as `0x${string}`,
  to: to as `0x${string}`,
  amount,
});

// USD value = raw amount (1:1) so assertions read cleanly.
const usdValue = (_token: string, raw: bigint) => Number(raw);

describe("aggregatePoolActivity", () => {
  it("counts distinct suppliers and splits base supply/borrow by origination", () => {
    const txs: IndexerTx[] = [
      { hash: "0x1", method: "supply(address,uint256)", from: USER_A, to: COMET, origination: "ecdsa", timestamp: "t" },
      { hash: "0x2", method: "supply(address,uint256)", from: USER_B, to: COMET, origination: "solana", timestamp: "t" },
      { hash: "0x3", method: "withdraw(address,uint256)", from: USER_A, to: COMET, origination: "ecdsa", timestamp: "t" },
      { hash: "0x4", method: "supply(address,uint256)", from: USER_A, to: COMET, origination: "ecdsa", timestamp: "t" }, // A again
    ];
    const transfersByHash: Record<string, TransferEvent[]> = {
      "0x1": [tEvent(BASE, USER_A, COMET, 100n)], // A supplies 100 base (evm)
      "0x2": [tEvent(BASE, USER_B, COMET, 50n)], // B supplies 50 base (sol)
      "0x3": [tEvent(BASE, COMET, USER_A, 30n)], // A withdraws/borrows 30 base (evm)
      "0x4": [tEvent(BASE, USER_A, COMET, 25n)], // A supplies 25 more (evm)
    };

    const out = aggregatePoolActivity({ txs, transfersByHash, comet: COMET, baseToken: BASE, usdValue });

    expect(out.suppliers).toBe(2); // A, B distinct
    expect(out.suppliedEvm).toBe(125); // 100 + 25
    expect(out.suppliedSol).toBe(50);
    expect(out.borrowedEvm).toBe(30);
    expect(out.borrowedSol).toBe(0);
  });

  it("ignores non-base transfers for liquidity (collateral supply doesn't count as supplied base)", () => {
    const txs: IndexerTx[] = [
      { hash: "0x1", method: "supply(address,uint256)", from: USER_A, to: COMET, origination: "ecdsa", timestamp: "t" },
    ];
    const transfersByHash = {
      "0x1": [tEvent("0xCOLLAT", USER_A, COMET, 999n)], // collateral, not base
    };
    const out = aggregatePoolActivity({ txs, transfersByHash, comet: COMET, baseToken: BASE, usdValue });
    expect(out.suppliers).toBe(1); // still a supplier
    expect(out.suppliedEvm).toBe(0); // but no base liquidity
  });

  it("treats any non-ecdsa origination as the Solana lane", () => {
    const txs: IndexerTx[] = [
      { hash: "0x1", method: "supply(address,uint256)", from: USER_B, to: COMET, origination: "solana", timestamp: "t" },
    ];
    const out = aggregatePoolActivity({
      txs,
      transfersByHash: { "0x1": [tEvent(BASE, USER_B, COMET, 10n)] },
      comet: COMET,
      baseToken: BASE,
      usdValue,
    });
    expect(out.suppliedSol).toBe(10);
    expect(out.suppliedEvm).toBe(0);
  });
});
