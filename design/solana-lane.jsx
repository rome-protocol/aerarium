// =====================================================================
// Solana lane — v2 relayer-driven flow (states 3a–3g)
//
// State machine (matches relayer's status enum):
//   3a  idle               not connected
//   3b  connected          ready to supply, no in-flight intent
//   3c  snapshot-pending   phase 1: relayer reserving spot on Rome EVM (~15-30s)
//   3d  awaiting-sign      phase 1 done, prompt user to sign in Phantom
//   3e  completing         phase 2: relayer crediting Compound position (~15-30s)
//   3f  complete           supply landed (position card visible)
//   3g  failed             any phase failed
//
// End-to-end wall time ~35-65s. The progress UX during the two ~15-30s waits
// is the design's main job — three-step dots + per-step tx-hash table.
// =====================================================================

const SOLANA_ADDR = '7mxE2pYrNvKqGwLcHDfXhJtFB5d8aRz9C1bP3MnQgxrW';
const COMET_ATA   = '5WYAng8tZpKxqLuMrFs4N7VbJzCkPdHkB6';
const POOL_ADDR   = '5WYAng8tZpKxqLuMrFs4N7VbJzCkPdHkB6';
const SNAPSHOT_TX = '0xabc4d2e9f8c7b6a5d4e3f2a1b0c9d8e7f6a5b4c3';
const SOLANA_SIG  = '5xY3zKpRvN4q7BcFmHtLxJgWdEsQ8aRz9C1bP3MnQ4K7';
const COMPLETE_TX = '0xdef6a7c8b9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4';

const SOLSCAN = (sig) => `https://solscan.io/tx/${sig}`;
const MARCUS  = (hash) => `https://explorer.testnet.romechain.io/tx/${hash}`;

const SolanaLane = ({ state, ctx, dispatch }) => {
  // ----- 3a: not connected -----
  if (state === 'idle') {
    return (
      <Card padding={48} style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <Eyebrow>Solana lane</Eyebrow>
          <h2 style={{
            fontFamily: 'var(--font-serif)', fontSize: 36, lineHeight: 1.15,
            letterSpacing: '-0.02em', margin: 0, fontWeight: 400, maxWidth: 560,
          }}>
            <i>Connect</i> your Solana wallet.
          </h2>
          <p style={{ margin: 0, fontSize: 16, color: 'var(--fg2)', maxWidth: 460 }}>
            Earn yield on your USDC by supplying to the Compound v3 pool on Rome.
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={() => dispatch({ type: 'SOL_CONNECT' })}>
          Connect Phantom
        </Button>
        <div style={{ marginTop: 22, fontSize: 13, color: 'var(--fg2)' }}>
          Don’t have Phantom?{' '}
          <a href="https://phantom.app" target="_blank" rel="noreferrer">Get it → phantom.app</a>
        </div>
      </Card>
    );
  }

  // Common header for all connected states
  const Header = (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 20, gap: 16, flexWrap: 'wrap',
    }}>
      <AddressChip address={SOLANA_ADDR} onDisconnect={() => dispatch({ type: 'SOL_DISCONNECT' })} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <Eyebrow>Wallet USDC</Eyebrow>
        <span style={{
          fontFamily: 'var(--font-serif)', fontSize: 22, letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {fmtUSDC(ctx.solWalletUsdc)}
        </span>
      </div>
    </div>
  );

  // ----- 3b: connected, ready to supply -----
  if (state === 'connected') {
    return (
      <div>
        {Header}
        <SupplyForm ctx={ctx} dispatch={dispatch} />
      </div>
    );
  }

  // ----- 3c, 3d, 3e: in-flight intent (relayer-driven) -----
  if (state === 'snapshot-pending' || state === 'awaiting-sign' || state === 'completing') {
    return (
      <div>
        {Header}
        <ProgressCard state={state} ctx={ctx} dispatch={dispatch} />
      </div>
    );
  }

  // ----- 3f: complete (has position) -----
  if (state === 'has-position') {
    return (
      <div>
        {Header}
        <PositionCard ctx={ctx} dispatch={dispatch} />
        <SupplyMoreCard ctx={ctx} dispatch={dispatch} />
      </div>
    );
  }

  // ----- 3g: error (any phase) -----
  if (state === 'failed') {
    return (
      <div>
        {Header}
        <FailedCard ctx={ctx} dispatch={dispatch} />
      </div>
    );
  }

  return null;
};

// =====================================================================
// 3b — Supply form
// Includes the explicit "~30-60 seconds" latency hint (set expectations
// before the click; surprise latency feels like a bug).
// =====================================================================
const SupplyForm = ({ ctx, dispatch }) => {
  const amt = parseFloat(ctx.supplyAmount || '0') || 0;
  const yearly = amt * (POOL_STATS.supplyApy / 100);
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <RN n="I" size={18} />
        <h3 style={{
          fontFamily: 'var(--font-serif)', fontSize: 24, margin: 0, fontWeight: 400,
          letterSpacing: '-0.01em',
        }}>Supply USDC</h3>
      </div>

      <div style={{ marginBottom: 14 }}>
        <AmountInput
          value={ctx.supplyAmount}
          onChange={(v) => dispatch({ type: 'SET_SUPPLY_AMT', value: v })}
          max={ctx.solWalletUsdc}
          autoFocus
        />
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
        padding: '14px 16px',
        background: 'var(--bg-secondary)',
        borderRadius: 8,
        marginBottom: 18,
      }}>
        <MetaLine
          label="You'll earn"
          value={`~$${yearly.toFixed(2)}/yr`}
          hint={`at ${fmtPct(POOL_STATS.supplyApy)} variable APY`}
          accent
        />
        <MetaLine
          label="Time"
          value="~30–60 seconds"
          hint="2-phase relayer flow"
        />
      </div>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!amt || amt > ctx.solWalletUsdc}
        onClick={() => dispatch({ type: 'SOL_SUPPLY_SUBMIT' })}
      >
        Supply {amt ? fmtUSDC(amt) : '0.00'} USDC
      </Button>
    </Card>
  );
};

const MetaLine = ({ label, value, hint, accent }) => (
  <div>
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: 'var(--fg2)', marginBottom: 4,
    }}>{label}</div>
    <div style={{
      fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500,
      color: accent ? 'var(--rome-purple)' : 'var(--fg1)',
      fontVariantNumeric: 'tabular-nums', marginBottom: 2,
    }}>{value}</div>
    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--fg2)' }}>
      {hint}
    </div>
  </div>
);

// =====================================================================
// 3c / 3d / 3e — Progress card
// Single component covering the three relayer-driven progress states.
// Same layout, different copy + tx-row status flips.
// =====================================================================
const ProgressCard = ({ state, ctx, dispatch }) => {
  const stepIdx = state === 'snapshot-pending' ? 0
                 : state === 'awaiting-sign'    ? 1
                                                : 2; // completing

  // Per-state copy
  const copy = {
    'snapshot-pending': {
      eyebrow: 'Step 1 of 3',
      title:   'Preparing your supply on Rome',
      body:    'The relayer is reserving your spot in the Compound pool. This takes ~15–30 seconds.',
      sub:     'You’ll be asked to sign once it’s ready.',
      icon:    <Spinner size={14} color="var(--rome-purple)" />,
    },
    'awaiting-sign': {
      eyebrow: 'Step 2 of 3',
      title:   'Pool is ready for your USDC',
      body:    `Please sign in Phantom to send ${fmtUSDC(parseFloat(ctx.supplyAmount || '0'))} USDC to the Compound pool on Solana. This is the only signature needed.`,
      sub:     null,
      icon:    <CheckIcon />,
    },
    'completing': {
      eyebrow: 'Step 3 of 3',
      title:   'Finalizing your supply on Rome',
      body:    'Your USDC arrived on Solana. The relayer is now crediting your Compound position. ~15–30 seconds.',
      sub:     null,
      icon:    <Spinner size={14} color="var(--rome-purple)" />,
    },
  }[state];

  // Tx-row statuses for each phase
  const snapshotStatus = state === 'snapshot-pending' ? 'pending' : 'done';
  const depositStatus  = state === 'snapshot-pending' || state === 'awaiting-sign'
                       ? 'idle'
                       : 'done';
  const completeStatus = state === 'completing' ? 'pending'
                       : state === 'snapshot-pending' || state === 'awaiting-sign'
                       ? 'idle' : 'done';

  return (
    <Card padding={32}>
      {/* Eyebrow + dots */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <Eyebrow>{copy.eyebrow}</Eyebrow>
        <ProgressDots step={stepIdx} total={3} />
      </div>

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        {copy.icon}
        <h3 style={{
          fontFamily: 'var(--font-serif)', fontSize: 26, margin: 0, fontWeight: 400,
          letterSpacing: '-0.015em', color: 'var(--fg1)', lineHeight: 1.2,
        }}>{copy.title}</h3>
      </div>

      <p style={{
        margin: 0, fontFamily: 'var(--font-sans)', fontSize: 15,
        color: 'var(--fg2)', maxWidth: 520, lineHeight: 1.5,
      }}>{copy.body}</p>
      {copy.sub && (
        <p style={{
          margin: '6px 0 0', fontFamily: 'var(--font-sans)', fontSize: 14,
          color: 'var(--fg2)', fontStyle: 'italic',
        }}>{copy.sub}</p>
      )}

      {/* CTA for awaiting-sign — user dismissed Phantom case */}
      {state === 'awaiting-sign' && (
        <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
          <Button variant="primary" size="lg" onClick={() => dispatch({ type: 'SOL_USER_SIGN' })}>
            Sign in Phantom →
          </Button>
          <Button variant="ghost" size="lg" onClick={() => dispatch({ type: 'SOL_FAIL', error: 'user-cancel' })}>
            Cancel
          </Button>
        </div>
      )}

      {/* Per-step tx hash table */}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
        <Eyebrow style={{ marginBottom: 8, display: 'block' }}>Phase status</Eyebrow>
        <TxRow
          label="Snapshot tx"
          hash={shortHash(SNAPSHOT_TX)}
          txUrl={MARCUS(SNAPSHOT_TX)}
          status={snapshotStatus}
          explorer="view on Marcus →"
        />
        <TxRow
          label="Solana deposit"
          hash={shortHash(SOLANA_SIG)}
          txUrl={SOLSCAN(SOLANA_SIG)}
          status={depositStatus}
          explorer="view on Solscan →"
        />
        <TxRow
          label="Complete tx"
          hash={shortHash(COMPLETE_TX)}
          txUrl={MARCUS(COMPLETE_TX)}
          status={completeStatus}
          explorer="view on Marcus →"
        />
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          paddingTop: 14, fontFamily: 'var(--font-mono)', fontSize: 11,
          letterSpacing: '0.1em', color: 'var(--fg3)',
        }}>
          <span>POOL · COMET ATA</span>
          <span>{shortHash(COMET_ATA)}</span>
        </div>
      </div>
    </Card>
  );
};

const CheckIcon = () => (
  <span style={{
    width: 22, height: 22, borderRadius: '50%', background: 'var(--rome-purple)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }}>
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 6.2 L4.8 8.5 L9.5 3.5" stroke="#FBF8F4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

const shortHash = (h) => h.length > 12 ? h.slice(0, 6) + '…' + h.slice(-4) : h;

// =====================================================================
// 3f — Position card
// Spec is explicit: BOTH tx hashes (Solana deposit + Rome supply) live here,
// not buried in the activity log. This is the demo's hero artifact.
// =====================================================================
const PositionCard = ({ ctx, dispatch }) => {
  const earned = ctx.solPosition.earned;
  const total = ctx.solPosition.supplied + earned;
  const wamt = parseFloat(ctx.withdrawAmount || '0') || 0;
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 22,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckIcon />
          <h3 style={{
            fontFamily: 'var(--font-serif)', fontSize: 24, margin: 0, fontWeight: 400,
            letterSpacing: '-0.01em',
          }}>Your supply position</h3>
        </div>
        <Eyebrow>Compound v3 · Rome</Eyebrow>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <PositionLine label="Supplied" value={fmtUSDC(ctx.solPosition.supplied) + ' USDC'} />
        <PositionLine label="Earned" value={'+' + fmtUSDC(earned, 4) + ' USDC'} accent />
        <PositionLine label="Total balance" value={fmtUSDC(total, 4) + ' USDC'} big />
        <PositionLine label="Current APY" value={fmtPct(POOL_STATS.supplyApy)} hint="variable" />
      </div>

      {/* Cross-VM tx hashes — the pitch artifact */}
      <div style={{
        padding: '16px 18px',
        background: 'var(--bg-secondary)',
        borderRadius: 10, marginBottom: 24,
      }}>
        <Eyebrow style={{ marginBottom: 10, display: 'block' }}>Cross-VM transaction record</Eyebrow>
        <TxRow
          label="Solana deposit"
          hash={shortHash(SOLANA_SIG)}
          txUrl={SOLSCAN(SOLANA_SIG)}
          status="done"
          explorer="view on Solscan →"
        />
        <TxRow
          label="Rome supply tx"
          hash={shortHash(COMPLETE_TX)}
          txUrl={MARCUS(COMPLETE_TX)}
          status="done"
          explorer="view on Marcus →"
        />
      </div>

      <Hairline />
      <div style={{ paddingTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <RN n="II" size={16} />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500 }}>Withdraw</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--fg3)', marginLeft: 'auto',
          }}>direct · no relayer</span>
        </div>
        <AmountInput
          value={ctx.withdrawAmount}
          onChange={(v) => dispatch({ type: 'SET_WITHDRAW_AMT', value: v })}
          max={total}
          maxLabel={`Max ${fmtUSDC(total)}`}
        />
        <Button
          variant="primary"
          size="lg"
          fullWidth
          style={{ marginTop: 14 }}
          disabled={!wamt || wamt > total}
          onClick={() => dispatch({ type: 'SOL_WITHDRAW' })}
        >
          Withdraw {wamt ? fmtUSDC(wamt) : '0.00'} USDC
        </Button>
      </div>
    </Card>
  );
};

const PositionLine = ({ label, value, accent, big, hint }) => (
  <div>
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em',
      textTransform: 'uppercase', color: 'var(--fg2)', marginBottom: 6,
    }}>{label}</div>
    <div style={{
      fontFamily: 'var(--font-serif)',
      fontSize: big ? 32 : 22,
      letterSpacing: '-0.015em',
      color: accent ? 'var(--rome-purple)' : 'var(--fg1)',
      fontWeight: 400, lineHeight: 1.1,
      fontVariantNumeric: 'tabular-nums',
    }}>{value}</div>
    {hint && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg2)', marginTop: 4 }}>{hint}</div>}
  </div>
);

// =====================================================================
// 3g — Failed card
// Maps four POC error cases (relayer offline / pending exists / amount
// mismatch / deposit-window expired). Inline + non-blocking.
// =====================================================================
const ERROR_CASES = {
  'relayer-offline': {
    title:    'Relayer is offline',
    message:  'The relayer service didn’t respond. Try again in a moment.',
    phase:    null,
    cta:      'Try again',
  },
  'pending-exists': {
    title:    'Another supply is in progress',
    message:  'OR: pending exists — you already have an active intent. Wait for it to complete before starting a new one.',
    phase:    'phase 1',
    cta:      'Start over',
  },
  'amount-mismatch': {
    title:    'Deposit amount didn’t match',
    message:  'Your funds are at the Comet ATA. Contact support to reclaim them — do not start a new supply.',
    phase:    'phase 2',
    cta:      'Contact support',
    showSupport: true,
  },
  'deposit-expired': {
    title:    'Deposit window expired',
    message:  'The pool snapshot is stale because the SPL transfer wasn’t confirmed in time. Please start over.',
    phase:    'phase 1',
    cta:      'Start over',
  },
  'user-cancel': {
    title:    'Supply cancelled',
    message:  'The pool snapshot is now stale. You can start a new supply at any time.',
    phase:    'phase 1',
    cta:      'Start over',
  },
};

const FailedCard = ({ ctx, dispatch }) => {
  const err = ERROR_CASES[ctx.solError] || ERROR_CASES['relayer-offline'];
  return (
    <Card padding={32} style={{
      borderColor: 'rgba(94,10,96,0.32)',
      background: 'rgba(94,10,96,0.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{
          width: 24, height: 24, borderRadius: '50%', background: 'var(--rome-purple)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--fg-inverse)', fontFamily: 'var(--font-serif)',
          fontSize: 16, fontWeight: 700, lineHeight: 1, flexShrink: 0,
        }}>!</span>
        <h3 style={{
          fontFamily: 'var(--font-serif)', fontSize: 26, margin: 0, fontWeight: 400,
          letterSpacing: '-0.015em',
        }}>{err.title}</h3>
        {err.phase && (
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--fg2)',
            border: '1px solid var(--border-default)', borderRadius: 999,
            padding: '4px 10px',
          }}>Failed in {err.phase}</span>
        )}
      </div>
      <p style={{
        margin: '0 0 24px', fontFamily: 'var(--font-sans)', fontSize: 15,
        color: 'var(--fg2)', lineHeight: 1.55, maxWidth: 560,
      }}>{err.message}</p>

      {/* Show snapshot tx if it exists (helpful for support) */}
      {err.phase === 'phase 1' || err.phase === 'phase 2' ? (
        <div style={{
          padding: '14px 16px', background: 'var(--bg-secondary)',
          borderRadius: 8, marginBottom: 24,
        }}>
          <TxRow
            label="Snapshot tx"
            hash={shortHash(SNAPSHOT_TX)}
            txUrl={MARCUS(SNAPSHOT_TX)}
            status="done"
            explorer="view on Marcus →"
          />
          {err.phase === 'phase 2' && (
            <TxRow
              label="Solana deposit"
              hash={shortHash(SOLANA_SIG)}
              txUrl={SOLSCAN(SOLANA_SIG)}
              status="done"
              explorer="view on Solscan →"
            />
          )}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 12 }}>
        <Button variant="primary" size="lg" onClick={() => dispatch({ type: 'SOL_RETRY' })}>
          {err.cta}
        </Button>
        {err.showSupport && (
          <Button variant="ghost" size="lg" onClick={() => {}}>
            Open Discord →
          </Button>
        )}
      </div>
    </Card>
  );
};

// =====================================================================
// Supply more (collapsed) — same as v1
// =====================================================================
const SupplyMoreCard = ({ ctx, dispatch }) => {
  const [open, setOpen] = useState(false);
  return (
    <Card padding={open ? 28 : 22}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RN n="III" size={16} />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500 }}>Supply more</span>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--fg2)',
          transform: open ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform 200ms',
          display: 'inline-block', lineHeight: 1,
        }}>+</span>
      </div>
      {open && (
        <div style={{ marginTop: 18 }}>
          <AmountInput
            value={ctx.supplyMoreAmount}
            onChange={(v) => dispatch({ type: 'SET_SUPPLY_MORE_AMT', value: v })}
            max={ctx.solWalletUsdc}
          />
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            style={{ marginTop: 14 }}
            disabled={!parseFloat(ctx.supplyMoreAmount || '0')}
            onClick={() => dispatch({ type: 'SOL_SUPPLY_MORE' })}
          >
            Supply {ctx.supplyMoreAmount || '0.00'} USDC
          </Button>
        </div>
      )}
    </Card>
  );
};

Object.assign(window, {
  SolanaLane, SupplyForm, ProgressCard, PositionCard, FailedCard, SupplyMoreCard,
  PositionLine, MetaLine, CheckIcon, shortHash,
  ERROR_CASES,
});
