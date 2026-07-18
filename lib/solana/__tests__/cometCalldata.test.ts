import { describe, it, expect } from "vitest";
import { maxUint256, decodeFunctionData } from "viem";

import {
  repayAmount,
  encodeRepay,
  encodeAbsorb,
  encodeBuyCollateral,
  encodeApprove,
} from "../cometCalldata";

describe("repayAmount — repay min(debt, walletBalance)", () => {
  it("caps the repayment at the outstanding debt when the wallet can cover it", () => {
    expect(repayAmount(1_000_000n, 5_000_000n)).toBe(1_000_000n);
  });
  it("is bounded by the wallet balance when the wallet is short of the debt", () => {
    expect(repayAmount(1_000_000n, 400_000n)).toBe(400_000n);
  });
  it("is zero when there is no debt to repay", () => {
    expect(repayAmount(0n, 5_000_000n)).toBe(0n);
  });
});

describe("encodeRepay — comet.supply(base, amount) (Compound v3 repays debt first)", () => {
  it("encodes the supply selector + base asset + amount", () => {
    const base = "0x9a8B4cB7326033d72cA393c6b4C0d7Fb904Fa900";
    const data = encodeRepay(base, 1_000_000n);
    expect(data.slice(0, 10)).toBe("0xf2b9fdb8"); // supply(address,uint256)
    expect(data.toLowerCase()).toContain("9a8b4cb7326033d72ca393c6b4c0d7fb904fa900");
  });
});

describe("encodeAbsorb — comet.absorb(absorber, [victim])", () => {
  it("encodes the absorb selector + absorber + victim address", () => {
    const absorber = "0x857534c27f4c0e8394921ad3b5b73cb4d7963633";
    const victim = "0x3403e0De09Bc76Ca7d74762F264e4F6B649A0562";
    const data = encodeAbsorb(absorber, [victim]);
    expect(data.slice(0, 10)).toBe("0xc3cecfd2"); // absorb(address,address[])
    expect(data.toLowerCase()).toContain("857534c27f4c0e8394921ad3b5b73cb4d7963633");
    expect(data.toLowerCase()).toContain("3403e0de09bc76ca7d74762f264e4f6b649a0562");
  });
});

describe("encodeApprove — exact-amount ERC20 approve (never maxUint256)", () => {
  const comet = "0x771D2f213b4C23f70Fa884d441a405F41F51Ab50";

  it("encodes the approve selector + spender + the EXACT amount", () => {
    const data = encodeApprove(comet, 1_000_000n);
    expect(data.slice(0, 10)).toBe("0x095ea7b3"); // approve(address,uint256)
    const { args } = decodeFunctionData({
      abi: [
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ type: "bool" }],
        },
      ],
      data,
    });
    expect((args[0] as string).toLowerCase()).toBe(comet.toLowerCase());
    expect(args[1]).toBe(1_000_000n); // exact, equals the spend amount
  });

  it("never emits an unbounded (maxUint256) allowance", () => {
    const data = encodeApprove(comet, 5_000_000n);
    const maxHex = maxUint256.toString(16);
    expect(data.toLowerCase()).not.toContain(maxHex);
  });
});

describe("encodeBuyCollateral — comet.buyCollateral(asset, minAmount, baseAmount, recipient)", () => {
  it("encodes the buyCollateral selector + asset + recipient", () => {
    const asset = "0x58e78208c8EDd4b9E8e49682701512dd2Ae63dB5"; // wHEAT (seized collateral)
    const recipient = "0x857534c27f4c0e8394921ad3b5b73cb4d7963633"; // synthetic claims the reward
    const data = encodeBuyCollateral(asset, 3_000_000_000n, 10_000_000n, recipient);
    expect(data.slice(0, 10)).toBe("0xe4e6e779"); // buyCollateral(address,uint256,uint256,address)
    expect(data.toLowerCase()).toContain("58e78208c8edd4b9e8e49682701512dd2ae63db5");
    expect(data.toLowerCase()).toContain("857534c27f4c0e8394921ad3b5b73cb4d7963633");
  });
});
