// =====================================================================
// Solana lane — states 3a–3f
// =====================================================================
const SolanaLane = ({ state, ctx, dispatch }) => {
  const SOLANA_ADDR = '7mxE2pYrNvKqGwLcHDfXhJtFB5d8aRz9C1bP3MnQgxrW';
  const SOLSCAN_TX = 'https://solscan.io/tx/3xK7yPm2nQ8FrV4cLs9hBzDjEgNwT6aXp1RkU';

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
          <p style={{ margin: 0, fontSize: 16, color: 'var(--fg2)', maxWidth: 440 }}>
            Earn yield on your USDC by supplying to the Compound v3 pool.
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

  // ----- Common header for connected states -----
  const Header = (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 20, gap: 16, flexWrap: 'wrap',
    }}>
      <AddressChip address={SOLANA_ADDR} onDisconnect={() => dispatch({ type: 'SOL_DISCONNECT' })} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <Eyebrow>Wallet USDC</Eyebrow>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, letterSpacing: '-0.01em' }}>
          {fmtUSDC(ctx.solWalletUsdc)}
        </span>
      </div>
    </div>
  );

  // ----- Supply form (used by 3b, 3c, 3f) -----
  const SupplyForm = ({ pending, error }) => {
    const amt = parseFloat(ctx.supplyAmount || '0') || 0;
    const yearly = amt * (POOL_STATS.supplyApy / 100);
    return (
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
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
            disabled={pending}
            autoFocus
          />
        </div>
        <div style={{
          fontSize: 13, color: 'var(--fg2)', marginBottom: 18,
          fontFamily: 'var(--font-sans)',
        }}>
          You’ll earn <span style={{ color: 'var(--rome-purple)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>~${yearly.toFixed(2)}/yr</span>
          {' '}at current APY ({fmtPct(POOL_STATS.supplyApy)}).
        </div>
        {pending === 'sign' && (
          <Button variant="primary" size="lg" fullWidth disabled>
            <Spinner size={14} color="currentColor" />
            Awaiting Phantom signature…
          </Button>
        )}
        {pending === 'confirm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="primary" size="lg" fullWidth disabled>
              <Spinner size={14} color="currentColor" />
              Confirming on Solana…
            </Button>
            <div style={{ textAlign: 'center' }}>
              <TxLink href={SOLSCAN_TX}>view tx on Solscan →</TxLink>
            </div>
          </div>
        )}
        {!pending && (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!amt || amt > ctx.solWalletUsdc}
            onClick={() => dispatch({ type: 'SOL_SUPPLY_SUBMIT' })}
          >
            Supply {amt ? fmtUSDC(amt) : '0.00'} USDC
          </Button>
        )}
        {error && (
          <InlineError
            message={error}
            onRetry={() => dispatch({ type: 'SOL_RETRY' })}
          />
        )}
      </Card>
    );
  };

  // ----- 3b: connected, no position -----
  if (state === 'connected') {
    return (
      <div>
        {Header}
        <SupplyForm />
      </div>
    );
  }

  // ----- 3c: tx pending (sign) -----
  if (state === 'tx-sign') {
    return (
      <div>
        {Header}
        <SupplyForm pending="sign" />
      </div>
    );
  }

  // ----- 3c: tx pending (confirm) -----
  if (state === 'tx-confirm') {
    return (
      <div>
        {Header}
        <SupplyForm pending="confirm" />
      </div>
    );
  }

  // ----- 3f: tx error -----
  if (state === 'tx-error') {
    return (
      <div>
        {Header}
        <SupplyForm error="Transaction failed: insufficient balance for fee." />
      </div>
    );
  }

  // ----- 3d / 3e: connected, has position -----
  if (state === 'has-position') {
    const earned = ctx.solPosition.earned;
    const total = ctx.solPosition.supplied + earned;
    const wamt = parseFloat(ctx.withdrawAmount || '0') || 0;
    return (
      <div>
        {Header}

        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
            <RN n="I" size={18} />
            <h3 style={{
              fontFamily: 'var(--font-serif)', fontSize: 24, margin: 0, fontWeight: 400,
              letterSpacing: '-0.01em',
            }}>Your supply position</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            <PositionLine label="Supplied" value={fmtUSDC(ctx.solPosition.supplied) + ' USDC'} />
            <PositionLine label="Earned" value={'+' + fmtUSDC(earned, 4) + ' USDC'} accent />
            <PositionLine label="Total balance" value={fmtUSDC(total, 4) + ' USDC'} big />
            <PositionLine label="Current APY" value={fmtPct(POOL_STATS.supplyApy)} hint="variable" />
          </div>

          <Hairline />
          <div style={{ paddingTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <RN n="II" size={16} />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500 }}>Withdraw</span>
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

        <SupplyMoreCard ctx={ctx} dispatch={dispatch} />
      </div>
    );
  }

  return null;
};

// ---------- Position line ----------
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
      fontWeight: 400,
      lineHeight: 1.1,
    }}>{value}</div>
    {hint && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg2)', marginTop: 4 }}>{hint}</div>}
  </div>
);

// ---------- Supply more (collapsed) ----------
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

Object.assign(window, { SolanaLane, PositionLine, SupplyMoreCard });
