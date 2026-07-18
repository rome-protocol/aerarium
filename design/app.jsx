// =====================================================================
// App shell — header, tabs, activity log, footer, root state machine
// =====================================================================

// ---------- Initial app state ----------
const INITIAL_CTX = {
  // Solana lane
  solWalletUsdc: 100.00,
  solPosition: { supplied: 0, earned: 0 },
  supplyAmount: '100',
  withdrawAmount: '50',
  supplyMoreAmount: '50',
  solError: null,            // 'relayer-offline' | 'pending-exists' | 'amount-mismatch' | 'deposit-expired' | 'user-cancel'
  // EVM lane
  evmRomeUsdc: 0,
  evmSepoliaUsdc: 1000,
  evmPosition: { supplied: 0, earned: 0 },
  depositAmount: '100',
  withdrawDest: 'rome',
  cctpStep: 1, // 0=burn, 1=attestation, 2=mint, 3=done
  cctpEtaMin: 14,
  justArrived: false,
  // Activity log
  activity: [],
};

// ---------- Reducer ----------
function reducer(state, action) {
  const now = Date.now();
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, tab: action.value };

    // ---- Solana ----
    case 'SOL_CONNECT':
      return { ...state, solState: 'connected' };
    case 'SOL_DISCONNECT':
      return { ...state, solState: 'idle', solPosition: { supplied: 0, earned: 0 } };
    case 'SET_SUPPLY_AMT':
      return { ...state, ctx: { ...state.ctx, supplyAmount: action.value } };
    case 'SET_WITHDRAW_AMT':
      return { ...state, ctx: { ...state.ctx, withdrawAmount: action.value } };
    case 'SET_SUPPLY_MORE_AMT':
      return { ...state, ctx: { ...state.ctx, supplyMoreAmount: action.value } };

    // v2 relayer-driven flow
    case 'SOL_SUPPLY_SUBMIT':
      // 3b → 3c: kick off phase 1 (snapshot pending)
      return { ...state, solState: 'snapshot-pending', ctx: { ...state.ctx, solError: null } };
    case 'SOL_SNAPSHOT_DONE':
      // 3c → 3d: phase 1 complete, prompt user for signature
      return { ...state, solState: 'awaiting-sign' };
    case 'SOL_USER_SIGN':
      // 3d → 3e: user signed, phase 2 begins (relayer completing on Rome)
      return { ...state, solState: 'completing' };
    case 'SOL_COMPLETE': {
      // 3e → 3f: position credited
      const amt = parseFloat(state.ctx.supplyAmount || '0') || 0;
      const now = Date.now();
      return {
        ...state,
        solState: 'has-position',
        ctx: {
          ...state.ctx,
          solWalletUsdc: Math.max(0, state.ctx.solWalletUsdc - amt),
          solPosition: { supplied: state.ctx.solPosition.supplied + amt, earned: state.ctx.solPosition.earned },
        },
        activity: [
          { id: 'a' + now, ts: now, lane: 'sol', verb: 'Supplied', amount: amt, txUrl: '#' },
          ...state.activity,
        ],
        toast: { message: `Supplied ${fmtUSDC(amt)} USDC.`, txUrl: '#' },
      };
    }
    case 'SOL_FAIL':
      return { ...state, solState: 'failed', ctx: { ...state.ctx, solError: action.error || 'relayer-offline' } };
    case 'SOL_RETRY':
      return { ...state, solState: 'connected', ctx: { ...state.ctx, solError: null } };
    case 'SOL_WITHDRAW': {
      const amt = parseFloat(state.ctx.withdrawAmount || '0') || 0;
      const newSupplied = Math.max(0, state.ctx.solPosition.supplied - amt);
      const now = Date.now();
      return {
        ...state,
        solState: newSupplied > 0 ? 'has-position' : 'connected',
        ctx: {
          ...state.ctx,
          solWalletUsdc: state.ctx.solWalletUsdc + amt,
          solPosition: { ...state.ctx.solPosition, supplied: newSupplied },
        },
        activity: [
          { id: 'a' + now, ts: now, lane: 'sol', verb: 'Withdrew', amount: amt, txUrl: '#' },
          ...state.activity,
        ],
        toast: { message: `Withdrew ${fmtUSDC(amt)} USDC to your Solana wallet.`, txUrl: '#' },
      };
    }
    case 'SOL_SUPPLY_MORE':
      // re-enter the flow from connected state
      return { ...state, solState: 'snapshot-pending', ctx: { ...state.ctx, supplyAmount: state.ctx.supplyMoreAmount, solError: null } };

    // ---- EVM ----
    case 'EVM_CONNECT':
      return { ...state, evmState: 'connected-empty' };
    case 'EVM_DISCONNECT':
      return { ...state, evmState: 'idle', ctx: { ...state.ctx, evmRomeUsdc: 0, evmPosition: { supplied: 0, earned: 0 } } };
    case 'SET_DEPOSIT_AMT':
      return { ...state, ctx: { ...state.ctx, depositAmount: action.value } };
    case 'SET_WITHDRAW_DEST':
      return { ...state, ctx: { ...state.ctx, withdrawDest: action.value } };
    case 'EVM_DEPOSIT_START':
      return { ...state, evmState: 'cctp-pending', ctx: { ...state.ctx, cctpStep: 0 } };
    case 'CCTP_ADVANCE': {
      const next = state.ctx.cctpStep + 1;
      if (next > 2) {
        const amt = parseFloat(state.ctx.depositAmount || '0') || 0;
        return {
          ...state,
          evmState: 'connected-funded',
          ctx: {
            ...state.ctx,
            cctpStep: 3,
            evmRomeUsdc: state.ctx.evmRomeUsdc + amt,
            evmSepoliaUsdc: state.ctx.evmSepoliaUsdc - amt,
            justArrived: true,
          },
          activity: [
            { id: 'a' + now, ts: now, lane: 'evm', verb: 'Deposited', amount: amt, txUrl: '#' },
            ...state.activity,
          ],
        };
      }
      return { ...state, ctx: { ...state.ctx, cctpStep: next, cctpEtaMin: Math.max(1, state.ctx.cctpEtaMin - 5) } };
    }
    case 'EVM_BRING_MORE':
      return { ...state, evmState: 'connected-empty', ctx: { ...state.ctx, justArrived: false, depositAmount: '100', cctpStep: 1, cctpEtaMin: 14 } };
    case 'DISMISS_ARRIVED':
      return { ...state, ctx: { ...state.ctx, justArrived: false } };
    case 'EVM_SUPPLY_SUBMIT':
      return { ...state, evmState: 'tx-sign' };
    case 'EVM_RETRY':
      return { ...state, evmState: 'connected-funded' };
    case 'EVM_WITHDRAW': {
      const amt = parseFloat(state.ctx.withdrawAmount || '0') || 0;
      const newSupplied = Math.max(0, state.ctx.evmPosition.supplied - amt);
      const newRome = state.ctx.withdrawDest === 'rome' ? state.ctx.evmRomeUsdc + amt : state.ctx.evmRomeUsdc;
      return {
        ...state,
        evmState: newSupplied > 0 ? 'has-position' : 'connected-funded',
        ctx: {
          ...state.ctx,
          evmRomeUsdc: newRome,
          evmPosition: { ...state.ctx.evmPosition, supplied: newSupplied },
        },
        activity: [
          { id: 'a' + now, ts: now, lane: 'evm', verb: 'Withdrew', amount: amt, txUrl: '#' },
          ...state.activity,
        ],
        toast: { message: `Withdrew ${fmtUSDC(amt)} USDC to ${state.ctx.withdrawDest === 'rome' ? 'Rome' : 'Sepolia'}.`, txUrl: '#' },
      };
    }

    // ---- Sim transitions (auto-advance on timer) ----
    case 'EVM_TX_CONFIRM':
      return { ...state, evmState: 'tx-confirm' };
    case 'EVM_TX_SUCCESS': {
      const amt = parseFloat(state.ctx.supplyAmount || '0') || 0;
      return {
        ...state,
        evmState: 'has-position',
        ctx: {
          ...state.ctx,
          evmRomeUsdc: Math.max(0, state.ctx.evmRomeUsdc - amt),
          evmPosition: { supplied: state.ctx.evmPosition.supplied + amt, earned: state.ctx.evmPosition.earned },
        },
        activity: [
          { id: 'a' + now, ts: now, lane: 'evm', verb: 'Supplied', amount: amt, txUrl: '#' },
          ...state.activity,
        ],
        toast: { message: `Supplied ${fmtUSDC(amt)} USDC.`, txUrl: '#' },
      };
    }
    case 'DISMISS_TOAST':
      return { ...state, toast: null };

    // ---- Demo / tweaks: jump to specific state ----
    case 'JUMP_SOL':
      return jumpSol(state, action.value);
    case 'JUMP_EVM':
      return jumpEvm(state, action.value);

    default:
      return state;
  }
}

function jumpSol(state, target) {
  const baseCtx = { ...state.ctx };
  switch (target) {
    case 'idle':
      return { ...state, solState: 'idle' };
    case 'connected':
      return { ...state, solState: 'connected', ctx: { ...baseCtx, solWalletUsdc: 100, solPosition: { supplied: 0, earned: 0 }, solError: null } };
    case 'snapshot-pending':
      return { ...state, solState: 'snapshot-pending', ctx: { ...baseCtx, solError: null } };
    case 'awaiting-sign':
      return { ...state, solState: 'awaiting-sign', ctx: { ...baseCtx, solError: null } };
    case 'completing':
      return { ...state, solState: 'completing', ctx: { ...baseCtx, solError: null } };
    case 'has-position':
      return {
        ...state, solState: 'has-position',
        ctx: { ...baseCtx, solWalletUsdc: 0.00, solPosition: { supplied: 100, earned: 0.0412 } },
      };
    case 'failed-relayer':
      return { ...state, solState: 'failed', ctx: { ...baseCtx, solError: 'relayer-offline' } };
    case 'failed-pending':
      return { ...state, solState: 'failed', ctx: { ...baseCtx, solError: 'pending-exists' } };
    case 'failed-amount':
      return { ...state, solState: 'failed', ctx: { ...baseCtx, solError: 'amount-mismatch' } };
    case 'failed-expired':
      return { ...state, solState: 'failed', ctx: { ...baseCtx, solError: 'deposit-expired' } };
    default:
      return state;
  }
}

function jumpEvm(state, target) {
  const baseCtx = { ...state.ctx };
  switch (target) {
    case 'idle':
      return { ...state, evmState: 'idle' };
    case 'connected-empty':
      return {
        ...state, evmState: 'connected-empty',
        ctx: { ...baseCtx, evmRomeUsdc: 0, evmSepoliaUsdc: 1000, evmPosition: { supplied: 0, earned: 0 }, justArrived: false },
      };
    case 'cctp-pending':
      return {
        ...state, evmState: 'cctp-pending',
        ctx: { ...baseCtx, cctpStep: 1, cctpEtaMin: 14 },
      };
    case 'connected-funded':
      return {
        ...state, evmState: 'connected-funded',
        ctx: { ...baseCtx, evmRomeUsdc: 100, evmSepoliaUsdc: 900, evmPosition: { supplied: 0, earned: 0 }, justArrived: true },
      };
    case 'tx-error':
      return { ...state, evmState: 'tx-error', ctx: { ...baseCtx, evmRomeUsdc: 100, justArrived: false } };
    case 'has-position':
      return {
        ...state, evmState: 'has-position',
        ctx: { ...baseCtx, evmRomeUsdc: 0, evmSepoliaUsdc: 900, evmPosition: { supplied: 100, earned: 0.0412 }, justArrived: false },
      };
    default:
      return state;
  }
}

// ---------- Header / pool stats ----------
const PageHeader = ({ dark, onToggleDark }) => (
  <header style={{
    borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--bg-page)',
  }}>
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 32px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Lockup size={38} basePath="brand" variant={dark ? 'white' : 'purple'} />
          <div style={{
            width: 1, height: 56, background: 'var(--border-default)', margin: '0 6px',
          }} />
          <div>
            <Eyebrow>Rome Compound · Demo</Eyebrow>
            <h1 style={{
              fontFamily: 'var(--font-serif)', fontSize: 30, lineHeight: 1.1,
              letterSpacing: '-0.02em', margin: '4px 0 0', fontWeight: 400,
            }}>
              Compound on Rome <span style={{ color: 'var(--fg2)' }}>—</span> <i>USDC</i> lending.
            </h1>
            <div style={{ marginTop: 4, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg2)' }}>
              Same pool, two wallet lanes.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={onToggleDark}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
            style={{
              appearance: 'none', background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: 999, width: 32, height: 32,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--fg1)', padding: 0,
              transition: 'background .15s, border-color .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {dark ? (
              // sun
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              // moon
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <a href="#" style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'var(--rome-purple)',
            textDecoration: 'none', borderBottom: '1px solid var(--rome-purple)',
            paddingBottom: 2,
          }}>v3 testnet ↗</a>
        </div>
      </div>

      {/* Pool stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 0, paddingTop: 8,
        borderTop: '1px solid var(--border-subtle)',
      }}>
        <PoolStatCell label="Total supplied" value={fmtUSD(POOL_STATS.tvl)} numeral="I" />
        <PoolStatCell label="Supply APY" value={fmtPct(POOL_STATS.supplyApy)} numeral="II" accent />
        <PoolStatCell label="Borrow APY" value={fmtPct(POOL_STATS.borrowApy)} numeral="III" />
        <PoolStatCell label="Utilization" value={POOL_STATS.utilization + '%'} numeral="IV" last />
      </div>
    </div>
  </header>
);

const PoolStatCell = ({ label, value, numeral, accent, last }) => (
  <div style={{
    padding: '20px 24px 18px',
    borderRight: last ? 'none' : '1px solid var(--border-subtle)',
    display: 'flex', flexDirection: 'column', gap: 10,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <RN n={numeral} size={12} color="var(--fg3)" />
      <Eyebrow>{label}</Eyebrow>
    </div>
    <div style={{
      fontFamily: 'var(--font-serif)',
      fontSize: 38, lineHeight: 1, letterSpacing: '-0.025em',
      color: accent ? 'var(--rome-purple)' : 'var(--fg1)',
      fontWeight: 400,
      fontVariantNumeric: 'tabular-nums',
    }}>{value}</div>
  </div>
);

// ---------- Tab bar ----------
const TabBar = ({ active, onChange }) => {
  const tabs = [
    { id: 'sol', label: 'Solana wallet' },
    { id: 'evm', label: 'EVM wallet' },
  ];
  return (
    <div style={{
      display: 'flex', gap: 0,
      borderBottom: '1px solid var(--border-default)',
      marginBottom: 32,
    }}>
      {tabs.map((t, i) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '18px 0',
              marginRight: 36,
              cursor: 'pointer',
              position: 'relative',
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: 'var(--font-sans)',
              fontSize: 15,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? 'var(--fg1)' : 'var(--fg2)',
              letterSpacing: '-0.005em',
            }}
          >
            <RN n={i === 0 ? 'I' : 'II'} size={13} color={isActive ? 'var(--rome-purple)' : 'var(--fg3)'} />
            {t.label}
            {isActive && (
              <span style={{
                position: 'absolute', left: 0, right: 0, bottom: -1, height: 2,
                background: 'var(--rome-purple)',
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
};

// ---------- Activity log ----------
const ActivityLog = ({ items, lane }) => {
  const filtered = items.filter(i => i.lane === lane);
  return (
    <section style={{ marginTop: 56 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Eyebrow>Recent activity</Eyebrow>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg3)' }}>
            ({lane === 'sol' ? 'Solana lane' : 'EVM lane'})
          </span>
        </div>
      </div>

      <Hairline />

      {filtered.length === 0 ? (
        <div style={{
          padding: '28px 0', fontFamily: 'var(--font-sans)',
          fontSize: 14, color: 'var(--fg2)',
        }}>
          No activity yet — supply USDC to get started.
        </div>
      ) : (
        <div>
          {filtered.map((row) => (
            <div key={row.id} style={{
              display: 'grid',
              gridTemplateColumns: '120px 120px 1fr auto',
              gap: 24, alignItems: 'baseline',
              padding: '14px 0',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg2)', letterSpacing: '0.02em' }}>
                {relTime(row.ts)}
              </span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500 }}>
                {row.verb}
              </span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
                {fmtUSDC(row.amount)} <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg2)', letterSpacing: '0.14em' }}>USDC</span>
              </span>
              <TxLink href={row.txUrl}>view tx →</TxLink>
            </div>
          ))}
          <div style={{ padding: '14px 0', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg3)' }}>
            No more activity.
          </div>
        </div>
      )}
    </section>
  );
};

// ---------- Footer ----------
const PageFooter = ({ dark }) => (
  <footer style={{
    marginTop: 80,
    borderTop: '1px solid var(--border-subtle)',
  }}>
    <div style={{
      maxWidth: 1080, margin: '0 auto', padding: '24px 32px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 24, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src={dark ? 'brand/logomark-tight-white.svg' : 'assets/logomark-black.svg'} alt="" style={{ width: 18, height: 18, opacity: 0.7 }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg2)' }}>
          Powered by Rome
        </span>
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <a href="#" style={footerLink}>Compound v3 deployment</a>
        <a href="#" style={footerLink}>GitHub</a>
        <a href="#" style={footerLink}>Docs</a>
      </div>
    </div>
  </footer>
);
const footerLink = {
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: 'var(--fg2)', textDecoration: 'none',
};

// ---------- Tweaks panel for state switching ----------
const StateTweaks = ({ tweaks, setTweak, dispatch, state }) => {
  return (
    <TweaksPanel title="Demo controls">
      <TweakSection title="Solana lane state">
        <TweakSelect
          value={state.solState}
          onChange={(v) => dispatch({ type: 'JUMP_SOL', value: v })}
          options={[
            { value: 'idle', label: '3a · Not connected' },
            { value: 'connected', label: '3b · Ready to supply' },
            { value: 'snapshot-pending', label: '3c · Phase 1 (snapshot)' },
            { value: 'awaiting-sign', label: '3d · Awaiting signature' },
            { value: 'completing', label: '3e · Phase 2 (completing)' },
            { value: 'has-position', label: '3f · Has position' },
            { value: 'failed-relayer', label: '3g · Failed — relayer offline' },
            { value: 'failed-pending', label: '3g · Failed — pending exists' },
            { value: 'failed-amount', label: '3g · Failed — amount mismatch' },
            { value: 'failed-expired', label: '3g · Failed — window expired' },
          ]}
        />
      </TweakSection>
      <TweakSection title="EVM lane state">
        <TweakSelect
          value={state.evmState}
          onChange={(v) => dispatch({ type: 'JUMP_EVM', value: v })}
          options={[
            { value: 'idle', label: '4a · Not connected' },
            { value: 'connected-empty', label: '4b · Empty, deposit form' },
            { value: 'cctp-pending', label: '4c · CCTP attestation' },
            { value: 'connected-funded', label: '4d · Funded, supply form' },
            { value: 'has-position', label: '4d · Has supply position' },
            { value: 'tx-error', label: '4d · Tx error' },
          ]}
        />
      </TweakSection>
      <TweakSection title="Sandbox">
        <TweakButton onClick={() => {
          // simulate full Solana flow
          dispatch({ type: 'JUMP_SOL', value: 'connected' });
        }}>Reset Solana lane</TweakButton>
        <TweakButton onClick={() => dispatch({ type: 'JUMP_EVM', value: 'connected-empty' })}>
          Reset EVM lane
        </TweakButton>
      </TweakSection>
      <TweakSection title="Active tab">
        <TweakRadio
          value={state.tab}
          onChange={(v) => dispatch({ type: 'SET_TAB', value: v })}
          options={[
            { value: 'sol', label: 'Solana' },
            { value: 'evm', label: 'EVM' },
          ]}
        />
      </TweakSection>
      <TweakSection title="Appearance">
        <TweakToggle
          label="Dark mode"
          value={!!tweaks.dark}
          onChange={(v) => setTweak('dark', v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
};

// ---------- App ----------
const App = () => {
  const [state, dispatch] = React.useReducer(reducer, {
    tab: 'sol',
    solState: 'idle',
    evmState: 'idle',
    ctx: INITIAL_CTX,
    activity: [],
    toast: null,
  });

  // Auto-advance Solana relayer flow
  // 3c snapshot-pending → 3d awaiting-sign  (~15-30s, sim'd at 2s)
  // 3e completing → 3f has-position         (~15-30s, sim'd at 2s)
  useEffect(() => {
    if (state.solState === 'snapshot-pending') {
      const t = setTimeout(() => dispatch({ type: 'SOL_SNAPSHOT_DONE' }), 2200);
      return () => clearTimeout(t);
    }
    if (state.solState === 'completing') {
      const t = setTimeout(() => dispatch({ type: 'SOL_COMPLETE' }), 2200);
      return () => clearTimeout(t);
    }
  }, [state.solState]);

  // Auto-advance EVM tx
  useEffect(() => {
    if (state.evmState === 'tx-sign') {
      const t = setTimeout(() => dispatch({ type: 'EVM_TX_CONFIRM' }), 1600);
      return () => clearTimeout(t);
    }
    if (state.evmState === 'tx-confirm') {
      const t = setTimeout(() => dispatch({ type: 'EVM_TX_SUCCESS' }), 2000);
      return () => clearTimeout(t);
    }
  }, [state.evmState]);

  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "dark": false
  }/*EDITMODE-END*/);

  // Apply dark mode by toggling a class on <body>. Single source of truth.
  useEffect(() => {
    document.body.classList.toggle('dark', !!tweaks.dark);
  }, [tweaks.dark]);

  return (
    <div data-screen-label="Compound on Rome demo" style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <PageHeader dark={tweaks.dark} onToggleDark={() => setTweak('dark', !tweaks.dark)} />

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 32px' }}>
        <TabBar active={state.tab} onChange={(v) => dispatch({ type: 'SET_TAB', value: v })} />

        <div style={{ minHeight: 480 }}>
          {state.tab === 'sol' ? (
            <SolanaLane state={state.solState} ctx={state.ctx} dispatch={dispatch} />
          ) : (
            <EvmLane state={state.evmState} ctx={state.ctx} dispatch={dispatch} />
          )}
        </div>

        <ActivityLog items={state.activity} lane={state.tab} />
      </main>

      <PageFooter dark={tweaks.dark} />

      <Toast
        message={state.toast?.message}
        txUrl={state.toast?.txUrl}
        onDismiss={() => dispatch({ type: 'DISMISS_TOAST' })}
      />

      <StateTweaks tweaks={tweaks} setTweak={setTweak} dispatch={dispatch} state={state} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
