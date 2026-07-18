import { describe, it, expect } from "vitest";
import { signSteps } from "../primitives";
import type { ActionType } from "../types";

// signSteps is DYNAMIC: the popup count must match exactly what will happen, so
// the user never sees "2" and signs 3 (or vice-versa). The conditional legs:
//   - supply/repay: an Approve popup precedes the action only when allowance < amount
//   - Solana withdraw/borrow: a "create wallet account" popup only when the ATA is missing
// The adapters read these preconditions live and pass them as opts.

const signs = (s: ReturnType<typeof signSteps>) => s.filter((x) => x.tag === "Sign");

describe("signSteps — EVM lane (exact)", () => {
  it("action only (1 sign + confirm) when no approve is needed", () => {
    const s = signSteps("evm", "supply", { needsApprove: false });
    expect(signs(s)).toHaveLength(1);
    expect(s.at(-1)!.tag).toBe("Wait");
  });
  it("approve + action (2 signs, numbered) when approve is needed", () => {
    const s = signSteps("evm", "supply", { needsApprove: true });
    expect(signs(s)).toHaveLength(2);
    expect(signs(s)[0].label).toMatch(/approve/i);
    expect(signs(s)[0].label).toContain("1 of 2");
    expect(signs(s)[1].label).toContain("2 of 2");
  });
  it("withdraw/borrow are a single signature (no approve)", () => {
    expect(signs(signSteps("evm", "withdraw"))).toHaveLength(1);
    expect(signs(signSteps("evm", "borrow"))).toHaveLength(1);
  });
  it("confirm step always names the action", () => {
    for (const a of ["supply", "withdraw", "borrow", "repay"] as ActionType[])
      expect(signSteps("evm", a).at(-1)!.label.toLowerCase()).toContain(a);
  });
});

describe("signSteps — Solana lane (exact, fund/sweep legs counted)", () => {
  it("supply pre-approved = fund + supply (2 signs)", () => {
    const s = signSteps("sol", "supply", { needsApprove: false });
    expect(signs(s)).toHaveLength(2);
    expect(signs(s)[0].label.toLowerCase()).toContain("fund");
    expect(signs(s)[0].label).toContain("1 of 2");
  });
  it("supply needing approve = fund + approve + supply (3 signs — the operator's case)", () => {
    const s = signSteps("sol", "supply", { needsApprove: true });
    expect(signs(s)).toHaveLength(3);
    expect(signs(s)[0].label.toLowerCase()).toContain("fund");
    expect(signs(s)[1].label.toLowerCase()).toContain("approve");
    expect(signs(s)[2].label.toLowerCase()).toContain("supply");
    expect(signs(s)[2].label).toContain("3 of 3");
  });
  it("repay needing approve = fund + approve + repay (3 signs)", () => {
    const s = signSteps("sol", "repay", { needsApprove: true });
    expect(signs(s)).toHaveLength(3);
    expect(s.map((x) => x.label).join(" ").toLowerCase()).toContain("repay");
  });
  it("withdraw = withdraw + return-to-wallet (2 signs); +1 when the wallet ATA must be created", () => {
    expect(signs(signSteps("sol", "withdraw", {}))).toHaveLength(2);
    expect(signs(signSteps("sol", "withdraw", { needsWalletAta: true }))).toHaveLength(3);
  });
  it("borrow = authorize + send-to-wallet (2 signs); +1 with wallet-ATA creation", () => {
    expect(signs(signSteps("sol", "borrow", {}))).toHaveLength(2);
    expect(signs(signSteps("sol", "borrow", { needsWalletAta: true }))).toHaveLength(3);
  });
  it("withdraw and repay remain distinct recipes", () => {
    expect(signSteps("sol", "withdraw", {})).not.toEqual(signSteps("sol", "repay", {}));
  });
});
