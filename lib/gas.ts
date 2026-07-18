// Buffered eth_estimateGas wrapper.
//
// Why this exists: on Rome chains, MetaMask's own fee preview ("Network
// fee") frequently shows "Unavailable" if viem's writeContract is called
// without an explicit gas argument. The wallet's internal estimation
// hits the upstream RPC which returns numbers MetaMask can't reconcile
// against EIP-1559 base fees, so the popup renders with no fee preview
// and the user has to trust-fall into the signature.
//
// Pre-estimating server-side (well — client-side from compound's `/api/
// rome-rpc` proxy) via the same publicClient that drives reads avoids
// that hiccup: the wallet receives a fixed `gas` and skips its own
// estimation entirely. 1.3× buffer is the the Rome web app useTopUpUserPda
// pattern; the Aave demo's faucet uses the same.
import type { PublicClient } from "viem";

export const GAS_BUFFER_NUM = 13n;
export const GAS_BUFFER_DEN = 10n;

export function buffered(estimate: bigint): bigint {
  return (estimate * GAS_BUFFER_NUM) / GAS_BUFFER_DEN;
}

interface EstimateContractGasArgs {
  account: `0x${string}`;
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export async function estimateContractGasBuffered(
  publicClient: PublicClient,
  call: EstimateContractGasArgs,
): Promise<bigint> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const estimate = await publicClient.estimateContractGas(call as any);
  return buffered(estimate);
}

interface EstimateGasArgs {
  account: `0x${string}`;
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
}

export async function estimateGasBuffered(
  publicClient: PublicClient,
  tx: EstimateGasArgs,
): Promise<bigint> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const estimate = await publicClient.estimateGas(tx as any);
  return buffered(estimate);
}
