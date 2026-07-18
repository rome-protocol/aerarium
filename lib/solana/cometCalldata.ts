// Pure calldata + amount helpers for the Compound v3 write paths the
// Solana-native discovery lane drives via DoTxUnsigned. Kept free of
// React / wallet deps so they're unit-testable.

import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";

const COMET_WRITE_ABI = [
  {
    type: "function",
    name: "supply",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "absorb",
    stateMutability: "nonpayable",
    inputs: [
      { name: "absorber", type: "address" },
      { name: "accounts", type: "address[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "buyCollateral",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "minAmount", type: "uint256" },
      { name: "baseAmount", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
  },
] as const;

/**
 * Repayment amount = min(outstanding debt, wallet balance). Compound v3 has no
 * separate repay() — supply(base, amount) repays the borrow first, then any
 * surplus becomes supply balance. Capping at the debt keeps "repay" from
 * silently turning leftover wallet funds into a fresh supply position.
 */
export function repayAmount(debt: bigint, walletBalance: bigint): bigint {
  if (debt <= 0n) return 0n;
  return walletBalance < debt ? walletBalance : debt;
}

/** comet.supply(base, amount) — the repay path (and plain base supply). */
export function encodeRepay(baseAsset: Address | Hex, amount: bigint): Hex {
  return encodeFunctionData({
    abi: COMET_WRITE_ABI,
    functionName: "supply",
    args: [baseAsset as Address, amount],
  });
}

/** ERC20 approve(spender, amount) for EXACTLY `amount` — never maxUint256. A
 *  standing/unbounded allowance is a footgun: if the user approves but doesn't
 *  immediately act, anyone could pull up to the allowance. The exact approve is
 *  bundled with (and fully consumed by) the spend in one atomic tx, so the
 *  allowance never outlives the tx that uses it (residual = 0). */
export function encodeApprove(spender: Address | Hex, amount: bigint): Hex {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender as Address, amount],
  });
}

/** comet.absorb(absorber, accounts) — seize an underwater account's collateral
 *  and clear its debt; the absorber can later buyCollateral at a discount. */
export function encodeAbsorb(absorber: Address | Hex, victims: (Address | Hex)[]): Hex {
  return encodeFunctionData({
    abi: COMET_WRITE_ABI,
    functionName: "absorb",
    args: [absorber as Address, victims as Address[]],
  });
}

/** comet.buyCollateral(asset, minAmount, baseAmount, recipient) — buy seized
 *  collateral from the protocol's reserves at the storeFront discount. The
 *  liquidator's reward is the discount (collateral worth more than baseAmount). */
export function encodeBuyCollateral(
  asset: Address | Hex,
  minAmount: bigint,
  baseAmount: bigint,
  recipient: Address | Hex,
): Hex {
  return encodeFunctionData({
    abi: COMET_WRITE_ABI,
    functionName: "buyCollateral",
    args: [asset as Address, minAmount, baseAmount, recipient as Address],
  });
}
