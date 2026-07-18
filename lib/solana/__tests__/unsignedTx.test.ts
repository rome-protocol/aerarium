import { describe, it, expect } from 'vitest';
import { parseTransaction } from 'viem';
import { buildUnsignedEip1559Rlp } from '../unsignedTx';

describe('buildUnsignedEip1559Rlp', () => {
  // the Rome EVM program Eip1559unsigned::from_rlp expects a BARE 9-item RLP list
  // (NOT prefixed with the 0x02 type byte):
  //   [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList]
  //
  // Golden vector computed by hand from RLP rules for:
  //   chainId=1, nonce=0, maxPrio=0, maxFee=0, gas=0, to=0x11*20, value=0, data='', accessList=[]
  //   items: 01 80 80 80 80 94<20*11> 80 80 c0  -> payload 29 bytes -> list header 0xdd
  // (independently confirmed by viem fromRlp decoding back to the 9 expected fields)
  it('encodes a bare 9-item RLP list (no 0x02) — hand-computed golden vector', () => {
    const rlp = buildUnsignedEip1559Rlp({
      chainId: 1,
      nonce: 0,
      maxPriorityFeePerGas: 0n,
      maxFeePerGas: 0n,
      gasLimit: 0n,
      to: `0x${'11'.repeat(20)}`,
      value: 0n,
      data: '0x',
    });
    expect(rlp).toBe(
      '0xdd01808080809411111111111111111111111111111111111111118080c0',
    );
  });

  it('roundtrips through viem parseTransaction once the 0x02 type byte is restored', () => {
    const tx = {
      chainId: 200010,
      nonce: 7,
      maxPriorityFeePerGas: 1_000_000n,
      maxFeePerGas: 2_000_000n,
      gasLimit: 1_500_000n,
      to: `0x${'ab'.repeat(20)}` as const,
      value: 123n,
      data: '0xdeadbeef' as const,
    };
    const bare = buildUnsignedEip1559Rlp(tx);
    const parsed = parseTransaction(`0x02${bare.slice(2)}`);
    expect(parsed.type).toBe('eip1559');
    expect(parsed.chainId).toBe(200010);
    expect(parsed.nonce).toBe(7);
    expect(parsed.to?.toLowerCase()).toBe(tx.to);
    expect(parsed.value).toBe(123n);
    expect(parsed.data).toBe('0xdeadbeef');
    expect(parsed.maxFeePerGas).toBe(2_000_000n);
    expect(parsed.maxPriorityFeePerGas).toBe(1_000_000n);
    expect(parsed.gas).toBe(1_500_000n);
  });
});
