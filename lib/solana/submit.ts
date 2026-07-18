import {
  Connection,
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  SendTransactionError,
  type AccountMeta,
  type AddressLookupTableAccount,
} from '@solana/web3.js';

// Raise the CU limit above the ~200K default (Rome EVM blows it) but not to the
// 1.4M max — leave Rome ~50K headroom. NOTE: this is the COMPUTE meter only. A
// heap fault ("Access violation in heap section") is NOT fixed here — for a
// trivial call like approve it signals a bad-account path (e.g. the cached
// wrapper touching a not-yet-created ATA), which is a prerequisite problem, not
// a budget problem.
const DOTX_CU_LIMIT = 1_350_000;

// Heap (memory) budget — SEPARATE from CU. The default BPF heap is 32KB, which
// even a plain approve overflows ("Access violation in heap section" at ~32.8KB).
// Request a 250KB frame (Rome's EVM heap ceiling); actual usage is tracked via
// the `Heap <n>` log line. Activate's ATA-create used only ~22KB, approve ~33KB —
// the frame is the envelope, not the consumption.
const DOTX_HEAP_BYTES = 250 * 1024;

/**
 * The two ComputeBudget ixs every DoTxUnsigned needs: heap frame + CU limit.
 * Default CU is 1.35M (leaves Rome ~50K headroom); pass `cuLimit` to push to the
 * 1.4M Solana max for heavy calls (borrow) that need every unit.
 */
export function computeBudgetIxs(cuLimit: number = DOTX_CU_LIMIT): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.requestHeapFrame({ bytes: DOTX_HEAP_BYTES }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
  ];
}

/**
 * Treasure (gas/fee) wallet PDA: seeds [chainId u64-LE, "TREASURE_SEED", index u64-LE].
 * A DoTxUnsigned execution pays a treasure wallet ~5000 lamports, but the
 * eth_estimate_gas discovery path does NOT surface it, so the client must
 * include it. There are 64 (TREASURE_NUMBER); the index is U256(hash) % 64 where
 * hash = the Solana slot placed in H256[24..32] (vm_atomic.rs::new_with_unsigned_tx).
 * For any realistic slot the low 6 bits are 0, so the index is reliably 0.
 */
export function treasureWallet(programId: PublicKey, chainId: number, index = 0): PublicKey {
  const chain = Buffer.alloc(8);
  chain.writeBigUInt64LE(BigInt(chainId));
  const idx = Buffer.alloc(8);
  idx.writeBigUInt64LE(BigInt(index));
  const [pda] = PublicKey.findProgramAddressSync(
    [chain, Buffer.from('TREASURE_SEED'), idx],
    programId,
  );
  return pda;
}
import { hexToBytes, type Hex } from 'viem';
import { syntheticAddress } from './identity';
import { buildUnsignedEip1559Rlp } from './unsignedTx';
import { buildDoTxUnsigned } from './instructions';
import { emulateCallAccounts } from './discovery';

const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

/** The synthetic account's external_auth PDA — seeds [EXTERNAL_AUTHORITY, addr]. */
export function externalAuthPda(programId: PublicKey, synthetic: Hex): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('EXTERNAL_AUTHORITY'), Buffer.from(hexToBytes(synthetic))],
    programId,
  );
  return pda;
}

/**
 * The address's EVM-state PDA (nonce / balance / code) — seeds
 * [chainId u64-LE, "ACCOUN_SEED", addr]. ("ACCOUN_SEED" is the on-chain
 * spelling — config.rs ACCOUNT_SEED = b"ACCOUN_SEED".) On-chain this is read
 * via State::nonce; if it's absent from a DoTxUnsigned's account list the
 * program panics at handler.rs:45 ("error to get nonce").
 */
export function balanceKeyPda(programId: PublicKey, chainId: number, address: Hex): PublicKey {
  const chain = Buffer.alloc(8);
  chain.writeBigUInt64LE(BigInt(chainId));
  const [pda] = PublicKey.findProgramAddressSync(
    [chain, Buffer.from('ACCOUN_SEED'), Buffer.from(hexToBytes(address))],
    programId,
  );
  return pda;
}

/** Standard associated token account address — seeds [owner, tokenProgram, mint]. */
export function associatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
  tokenProgram: PublicKey,
): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM,
  );
  return ata;
}

/**
 * Submit a single pre-built Solana instruction (e.g. ActivateAta) via Phantom:
 * assemble → sign → send → confirm (HTTP poll). For non-DoTxUnsigned rome
 * instructions that don't need the CU/heap/treasure plumbing.
 */
export interface SubmitIxDeps {
  connection: Connection;
  feePayer: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

/** Submit one or more pre-built instructions in a single Phantom-signed tx. */
export async function submitInstructions(
  instructions: TransactionInstruction[],
  deps: SubmitIxDeps,
): Promise<{ signature: string }> {
  const { blockhash, lastValidBlockHeight } = await deps.connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.feePayer = deps.feePayer;
  tx.recentBlockhash = blockhash;
  for (const ix of instructions) tx.add(ix);

  const signed = await deps.signTransaction(tx);
  let signature: string;
  try {
    signature = await deps.connection.sendRawTransaction(signed.serialize());
  } catch (e) {
    throw new Error(`submit failed: ${await describeSolanaError(e)}`);
  }
  const err = await pollConfirmation(deps.connection, signature, lastValidBlockHeight);
  if (err) {
    const logs = await fetchTxLogs(deps.connection, signature);
    throw new Error(`reverted: ${JSON.stringify(err)}${logs ? `\n${logs}` : ''}`);
  }
  return { signature };
}

export async function submitInstruction(
  ix: TransactionInstruction,
  deps: SubmitIxDeps,
): Promise<{ signature: string }> {
  return submitInstructions([ix], deps);
}

export interface SubmitV0Deps {
  connection: Connection;
  feePayer: PublicKey;
  /** Phantom's signTransaction — wallet adapter signs VersionedTransaction too. */
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
}

/**
 * Submit instructions as a v0 VersionedTransaction referencing Address Lookup
 * Tables — accounts present in a table are encoded as 1-byte indices instead of
 * inline 32-byte keys, so heavy calls (borrow / liquidate, 30+ accounts) fit
 * under Solana's 1232-byte limit. The ALTs must already be active on-chain (see
 * lib/solana/alt.ts ensureAlt).
 */
export async function submitV0Instructions(
  instructions: TransactionInstruction[],
  lookupTables: AddressLookupTableAccount[],
  deps: SubmitV0Deps,
): Promise<{ signature: string }> {
  const { blockhash, lastValidBlockHeight } = await deps.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: deps.feePayer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(lookupTables);
  const tx = new VersionedTransaction(message);

  const signed = await deps.signTransaction(tx);
  let signature: string;
  try {
    signature = await deps.connection.sendRawTransaction(signed.serialize());
  } catch (e) {
    throw new Error(`v0 submit failed: ${await describeSolanaError(e)}`);
  }
  const err = await pollConfirmation(deps.connection, signature, lastValidBlockHeight);
  if (err) {
    const logs = await fetchTxLogs(deps.connection, signature);
    throw new Error(`v0 reverted: ${JSON.stringify(err)}${logs ? `\n${logs}` : ''}`);
  }
  return { signature };
}

export interface FeeFields {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasLimit: bigint;
}

export interface EvmCall {
  to: Hex;
  data?: Hex;
  value?: bigint;
}

export interface AssembleDeps {
  /** discovery proxy (the Rome proxy #353 rome_emulateCallAccounts) */
  proxyUrl: string;
  programId: PublicKey;
  chainId: number;
  fetchImpl?: typeof fetch;
}

/**
 * Build the (unsigned) Solana Transaction for an EVM call originated by a
 * Solana-native user. Discovery returns a complete account list — the payer is
 * already the unique signer+writable entry (emulator set_signer), matching the
 * on-chain State::signer() rule — so the discovered metas are used verbatim as
 * the instruction keys and the payer is the feePayer. Caller supplies the
 * recentBlockhash so this stays free of network calls beyond discovery.
 */
export async function assembleDoTxUnsignedTx(
  params: {
    call: EvmCall;
    payer: PublicKey;
    nonce: bigint;
    fee: FeeFields;
    recentBlockhash: string;
    /**
     * Accounts to append to the discovered list. Needed for precompiles whose
     * account set the emulator can't surface — e.g. transfer_spl_to_signer
     * derives its destination from the outer Solana SIGNER, which eth_estimate_gas
     * doesn't bind, so discovery truncates to the tx-init accounts and the
     * on-chain execution panics (handler.rs:45) on the missing synthetic
     * balance/ATA PDAs. The caller derives + passes them here.
     */
    extraAccounts?: AccountMeta[];
  },
  deps: AssembleDeps,
): Promise<Transaction> {
  const from = syntheticAddress(params.payer);
  const accounts = await emulateCallAccounts(
    deps.proxyUrl,
    { from, to: params.call.to, data: params.call.data },
    params.payer.toBase58(),
    deps.fetchImpl,
  );

  // Discovery (eth_estimate_gas) omits the treasure (gas/fee) wallet the
  // DoTxUnsigned execution pays — append treasure_wallet(0) (writable). See
  // treasureWallet() for why the index is reliably 0.
  const treasure = treasureWallet(deps.programId, deps.chainId, 0);
  if (!accounts.some((a) => a.pubkey.equals(treasure))) {
    accounts.push({ pubkey: treasure, isSigner: false, isWritable: true });
  }

  // Append caller-supplied accounts discovery couldn't surface (deduped).
  for (const extra of params.extraAccounts ?? []) {
    if (!accounts.some((a) => a.pubkey.equals(extra.pubkey))) accounts.push(extra);
  }

  const unsignedRlp = buildUnsignedEip1559Rlp({
    chainId: deps.chainId,
    nonce: params.nonce,
    maxPriorityFeePerGas: params.fee.maxPriorityFeePerGas,
    maxFeePerGas: params.fee.maxFeePerGas,
    gasLimit: params.fee.gasLimit,
    to: params.call.to,
    value: params.call.value,
    data: params.call.data,
  });

  const ix = buildDoTxUnsigned({ programId: deps.programId, unsignedRlp, accounts });

  const tx = new Transaction();
  tx.feePayer = params.payer;
  tx.recentBlockhash = params.recentBlockhash;
  // Two budgets the client must set (Rome EVM normally runs with these; a
  // hand-built tx defaults to Solana's 200K CU / 32KB heap and faults).
  for (const cb of computeBudgetIxs()) tx.add(cb);
  tx.add(ix);
  return tx;
}

export interface SubmitDeps extends Omit<AssembleDeps, 'proxyUrl'> {
  proxyUrl: string;
  connection: Connection;
  /** Phantom's signTransaction (signs as feePayer). */
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

/**
 * Full Solana-native submit: discover → assemble → Phantom sign → send to the
 * Solana RPC (NOT the proxy) → confirm. On failure, surfaces the on-chain logs
 * (rome-evm emits the EVM revert reason / instruction error there) as the Error
 * message so the UI can show something actionable.
 */
export async function submitDoTxUnsigned(
  params: { call: EvmCall; payer: PublicKey; nonce: bigint; fee: FeeFields; extraAccounts?: AccountMeta[] },
  deps: SubmitDeps,
): Promise<{ signature: string }> {
  const { blockhash, lastValidBlockHeight } = await deps.connection.getLatestBlockhash();
  const tx = await assembleDoTxUnsignedTx(
    { ...params, recentBlockhash: blockhash },
    { proxyUrl: deps.proxyUrl, programId: deps.programId, chainId: deps.chainId, fetchImpl: deps.fetchImpl },
  );

  const signed = await deps.signTransaction(tx);

  let signature: string;
  try {
    signature = await deps.connection.sendRawTransaction(signed.serialize());
  } catch (e) {
    throw new Error(`DoTxUnsigned submit failed: ${await describeSolanaError(e)}`);
  }

  // Poll signature status over HTTP rather than confirmTransaction's WebSocket
  // subscription — Rome's custom RPC node may not expose a WS endpoint.
  const err = await pollConfirmation(deps.connection, signature, lastValidBlockHeight);
  if (err) {
    const logs = await fetchTxLogs(deps.connection, signature);
    throw new Error(
      `DoTxUnsigned reverted: ${JSON.stringify(err)}${logs ? `\n${logs}` : ''}`,
    );
  }

  return { signature };
}

async function pollConfirmation(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
): Promise<unknown | null> {
  for (;;) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status) {
      if (status.err) return status.err;
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
        return null;
      }
    }
    const height = await connection.getBlockHeight('confirmed');
    if (height > lastValidBlockHeight) {
      throw new Error('DoTxUnsigned not confirmed before blockhash expired');
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function describeSolanaError(e: unknown): Promise<string> {
  if (e instanceof SendTransactionError) {
    const logs = (await e.getLogs?.(undefined as never).catch(() => null)) ?? e.logs ?? null;
    return `${e.message}${logs ? `\n${(logs as string[]).join('\n')}` : ''}`;
  }
  return e instanceof Error ? e.message : String(e);
}

async function fetchTxLogs(connection: Connection, signature: string): Promise<string | null> {
  const tx = await connection
    .getTransaction(signature, { maxSupportedTransactionVersion: 0 })
    .catch(() => null);
  return tx?.meta?.logMessages?.join('\n') ?? null;
}
