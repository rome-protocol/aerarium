import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { assembleDoTxUnsignedTx, treasureWallet } from '../submit';
import { DO_TX_UNSIGNED_TAG } from '../instructions';

const programId = new PublicKey(new Uint8Array(32).fill(9));
// payer = 0x01*32 pubkey, whose synthetic is the known pin 0xb312…bafc
const payer = new PublicKey(new Uint8Array(32).fill(1));
const SYNTH = '0xb312bec018884c2d66667c67a90508214bd8bafc';
const blockhash = '11111111111111111111111111111111';

function fetchReturning(accs: { pubkey: string; is_signer: boolean; is_writable: boolean }[]) {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    // discovery must be asked for the synthetic `from` + the payer base58
    expect(body.method).toBe('rome_emulateCallAccounts');
    expect(body.params[0].from).toBe(SYNTH);
    expect(body.params[1]).toBe(payer.toBase58());
    return { json: async () => ({ jsonrpc: '2.0', id: 1, result: accs }) };
  });
}

describe('assembleDoTxUnsignedTx', () => {
  const call = { to: `0x${'ab'.repeat(20)}` as const, data: '0xdeadbeef' as const };
  const fee = { maxFeePerGas: 2_000_000n, maxPriorityFeePerGas: 1_000_000n, gasLimit: 1_500_000n };

  it('assembles a tx whose only instruction is DoTxUnsigned over the discovered accounts', async () => {
    // discovery includes the payer as the unique signer+writable (set_signer) + one PDA
    const accs = [
      { pubkey: payer.toBase58(), is_signer: true, is_writable: true },
      { pubkey: new PublicKey(new Uint8Array(32).fill(4)).toBase58(), is_signer: false, is_writable: true },
    ];
    const tx = await assembleDoTxUnsignedTx(
      { call, payer, nonce: 0n, fee, recentBlockhash: blockhash },
      { proxyUrl: 'http://localhost:9090', programId, chainId: 200010, fetchImpl: fetchReturning(accs) as unknown as typeof fetch },
    );
    // Two ComputeBudget ixs (requestHeapFrame disc=1 + setComputeUnitLimit
    // disc=2) then the DoTxUnsigned. Heap frame is required: approve overflows
    // the 32KB default heap. Order-independent assertions.
    const CB = 'ComputeBudget111111111111111111111111111111';
    const cbIxs = tx.instructions.filter((i) => i.programId.toBase58() === CB);
    expect(cbIxs.some((i) => i.data[0] === 1)).toBe(true); // requestHeapFrame
    expect(cbIxs.some((i) => i.data[0] === 2)).toBe(true); // setComputeUnitLimit

    const dotx = tx.instructions.find((i) => i.programId.equals(programId));
    expect(dotx).toBeDefined();
    expect(dotx!.data[0]).toBe(DO_TX_UNSIGNED_TAG);
    // discovered accounts, then treasure_wallet(0) appended (discovery omits it)
    const treasure = treasureWallet(programId, 200010, 0).toBase58();
    expect(dotx!.keys.map((k) => k.pubkey.toBase58())).toEqual([
      ...accs.map((a) => a.pubkey),
      treasure,
    ]);
    const treasureKey = dotx!.keys.find((k) => k.pubkey.toBase58() === treasure);
    expect(treasureKey?.isWritable).toBe(true);
    expect(treasureKey?.isSigner).toBe(false);
  });

  it('sets feePayer to the payer and carries the supplied blockhash', async () => {
    const accs = [{ pubkey: payer.toBase58(), is_signer: true, is_writable: true }];
    const tx = await assembleDoTxUnsignedTx(
      { call, payer, nonce: 3n, fee, recentBlockhash: blockhash },
      { proxyUrl: 'http://x', programId, chainId: 200010, fetchImpl: fetchReturning(accs) as unknown as typeof fetch },
    );
    expect(tx.feePayer?.equals(payer)).toBe(true);
    expect(tx.recentBlockhash).toBe(blockhash);
  });
});
