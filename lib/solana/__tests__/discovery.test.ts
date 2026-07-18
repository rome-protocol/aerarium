import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { toAccountMeta, emulateCallAccounts } from '../discovery';

// The proxy's rome_emulateCallAccounts (the Rome proxy #353) returns AccountMetaB58:
//   { pubkey: <base58 string>, is_signer: bool, is_writable: bool }  (snake_case serde)
describe('toAccountMeta', () => {
  it('maps proxy snake_case AccountMetaB58 -> web3.js AccountMeta', () => {
    const b58 = PublicKey.default.toBase58();
    const meta = toAccountMeta({ pubkey: b58, is_signer: true, is_writable: false });
    expect(meta.pubkey.toBase58()).toBe(b58);
    expect(meta.isSigner).toBe(true);
    expect(meta.isWritable).toBe(false);
  });
});

describe('emulateCallAccounts', () => {
  const synthetic = '0xb312bec018884c2d66667c67a90508214bd8bafc' as const;
  const to = '0x1111111111111111111111111111111111111111' as const;
  const payer = 'ALjB3vo5geCkbF9iXRswj2xG9Tr8cCkJnbc7EZE2cGBh';

  it('POSTs a rome_emulateCallAccounts request (call + payer) and maps the result', async () => {
    const acct = PublicKey.default.toBase58();
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      expect(body.method).toBe('rome_emulateCallAccounts');
      expect(body.params[0]).toMatchObject({ from: synthetic, to, data: '0x' });
      expect(body.params[1]).toBe(payer);
      return {
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: [{ pubkey: acct, is_signer: true, is_writable: true }],
        }),
      };
    });
    const accounts = await emulateCallAccounts(
      'http://localhost:9090',
      { from: synthetic, to },
      payer,
      fetchImpl as unknown as typeof fetch,
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0].pubkey.toBase58()).toBe(acct);
    expect(accounts[0].isSigner).toBe(true);
    expect(accounts[0].isWritable).toBe(true);
  });

  it('throws with the RPC error message (e.g. proxy without #353)', async () => {
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'Method not found' },
      }),
    }));
    await expect(
      emulateCallAccounts('http://x', { from: synthetic, to }, payer, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/Method not found/);
  });
});
