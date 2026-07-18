import { serializeTransaction, type Hex } from 'viem';

export interface UnsignedEip1559 {
  chainId: number | bigint;
  nonce: number | bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit: bigint;
  /** undefined = contract creation */
  to?: `0x${string}`;
  value?: bigint;
  /** call data, default '0x' */
  data?: `0x${string}`;
}

/**
 * Bare RLP-encoded unsigned EIP-1559 payload that the Rome EVM program
 * `Eip1559unsigned::from_rlp` decodes inside a DoTxUnsigned instruction:
 *   [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList]
 * This is viem's EIP-1559 serialization with the leading 0x02 type byte removed
 * — the on-chain decoder wants the bare 9-item list, not the typed envelope.
 * No signature: the Solana instruction signer authorizes; `from` is derived
 * on-chain from that signer via do_tx_unsigned::derive_sender.
 */
export function buildUnsignedEip1559Rlp(tx: UnsignedEip1559): Hex {
  const serialized = serializeTransaction({
    type: 'eip1559',
    chainId: Number(tx.chainId),
    nonce: Number(tx.nonce),
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    maxFeePerGas: tx.maxFeePerGas,
    gas: tx.gasLimit,
    to: tx.to,
    value: tx.value ?? 0n,
    data: tx.data ?? '0x',
    accessList: [],
  });
  return `0x${serialized.slice(4)}`;
}
