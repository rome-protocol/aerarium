// Shared, pure base-liquidity ceiling for both lanes.
//
// "How much base can the Comet actually hand out on a withdraw / borrow?" is the
// MIN of two facts:
//   - accounting net   = totalSupply − totalBorrow  (what suppliers net-supplied;
//                        you can't borrow/withdraw past the net suppliable base)
//   - physical balance = baseToken.balanceOf(comet) (what the contract HOLDS; it
//                        can only transfer base it physically has)
// On a healthy Comet these are equal. When the Comet runs a base DEFICIT (negative
// reserves — base was drawn down below the accounting net) the physical balance is
// the lower, binding ceiling. Feeding the uncapped accounting net into the action
// model lets Max overshoot what the Comet can pay → the on-chain withdraw/borrow
// reverts. Both lanes' liquidity derivation routes through here so they agree.

/**
 * The base liquidity ceiling = min(accounting net, physical base balance).
 * `baseBalanceRaw` null means the physical read was unavailable (a transient
 * multicall failure); in that case we fall back to the accounting net rather than
 * cap to 0 — an unknown physical balance must never block every action.
 */
export function cappedBaseLiquidityRaw(
  totalSupplyRaw: bigint,
  totalBorrowRaw: bigint,
  baseBalanceRaw: bigint | null,
): bigint {
  const net = totalSupplyRaw > totalBorrowRaw ? totalSupplyRaw - totalBorrowRaw : 0n;
  if (baseBalanceRaw == null) return net;
  return net < baseBalanceRaw ? net : baseBalanceRaw;
}
