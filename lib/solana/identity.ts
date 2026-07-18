import { keccak256 } from 'viem';
import { PublicKey } from '@solana/web3.js';

export type SolanaPubkeyInput = Uint8Array | PublicKey | string;

function pubkeyBytes(pubkey: SolanaPubkeyInput): Uint8Array {
  if (pubkey instanceof Uint8Array) return pubkey;
  if (typeof pubkey === 'string') return new PublicKey(pubkey).toBytes();
  return pubkey.toBytes();
}

/**
 * Synthetic EVM address for a Solana pubkey — byte-identical to
 * the Rome EVM program `do_tx_unsigned::derive_sender`: keccak256(pubkey)[12..32].
 * This is the EVM identity a Solana-native user controls on Rome (where their
 * balance and nonce live). It is NOT the MetaHook derive_sender, which hashes
 * `program_id ++ "callback_authority"`.
 */
export function syntheticAddress(pubkey: SolanaPubkeyInput): `0x${string}` {
  return `0x${keccak256(pubkeyBytes(pubkey)).slice(-40)}`;
}
