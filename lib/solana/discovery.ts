import { PublicKey, type AccountMeta } from '@solana/web3.js';
import type { Hex } from 'viem';

/** Shape the proxy returns for each account (the Rome proxy #353 AccountMetaB58, snake_case serde). */
export interface RawAccountMetaB58 {
  pubkey: string;
  is_signer: boolean;
  is_writable: boolean;
}

export function toAccountMeta(raw: RawAccountMetaB58): AccountMeta {
  return {
    pubkey: new PublicKey(raw.pubkey),
    isSigner: raw.is_signer,
    isWritable: raw.is_writable,
  };
}

export interface DiscoveryCall {
  /** synthetic EVM address (the Solana-native user's identity) */
  from: Hex;
  to: Hex;
  data?: Hex;
  value?: Hex;
}

/**
 * Ask the proxy which Solana accounts an EVM call from `from` would touch, via
 * the rome_emulateCallAccounts discovery RPC (the Rome proxy #353). This is the only
 * proxy involvement in the Solana-native write path and is off the tx path; the
 * returned metas feed buildDoTxUnsigned directly. `payer` must be an existing
 * on-chain account (the user's Phantom wallet), else the proxy errors "Signer
 * not found".
 */
export async function emulateCallAccounts(
  rpcUrl: string,
  call: DiscoveryCall,
  payer: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AccountMeta[]> {
  const res = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'rome_emulateCallAccounts',
      params: [
        {
          from: call.from,
          to: call.to,
          data: call.data ?? '0x',
          ...(call.value ? { value: call.value } : {}),
        },
        payer,
      ],
    }),
  });
  const json = (await res.json()) as {
    result?: RawAccountMetaB58[];
    error?: { code: number; message: string };
  };
  if (json.error) {
    throw new Error(`rome_emulateCallAccounts: ${json.error.message} (code ${json.error.code})`);
  }
  return (json.result ?? []).map(toAccountMeta);
}
