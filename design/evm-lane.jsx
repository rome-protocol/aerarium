// =====================================================================
// EVM lane — states 4a–4d + CCTP flow
// =====================================================================
const EvmLane = ({ state, ctx, dispatch }) => {
  const EVM_ADDR = '0x1234aB5cD6eF7890123456789abCdEf012345678';
  const ETHERSCAN_TX = 'https://sepolia.etherscan.io/tx/0xabc1234567890def';
  const ROME_TX = 'https://solscan.io/tx/4yLm9pQ3kT8FsR2cZx7hCw';

  // ----- 4a: not connected -----
  if (state === 'idle') {
    return (
      <Card padding={48} style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <Eyebrow>EVM lane</Eyebrow>
          <h2 style={{
            fontFamily: 'var(--font-serif)', fontSize: 36, lineHeight: 1.15,
            letterSpacing: '-0.02em', margin: 0, fontWeight: 400, maxWidth: 560,
          }}>
            <i>Bring</i> USDC over from Sepolia.
          </h2>
          <p style={{ margin: 0, fontSize: 16, color: 'var(--fg2)', maxWidth: 460 }}>
            Connect MetaMask, deposit via CCTP, and earn yield on Rome.
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={() => dispatch({ type: 'EVM_CONNECT' })}>
          Connect MetaMask
        </Button>
        <div style={{ marginTop: 22, fontSize: 13, color: 'var(--fg2)' }}>
          Need a wallet?{' '}
          <a href="https://metamask.io" target="_blank" rel="noreferrer">Get MetaMask → metamask.io</a>
        </div>
      </Card>
    );
  }

  // Connected header (balances row)
  const Header = (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 18, gap: 16, flexWrap: 'wrap',
      }}>
        <AddressChip address={EVM_ADDR} onDisconnect={() => dispatch({ type: 'EVM_DISCONNECT' })} />
      </div>
      <Card padding={22} style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 24, alignItems: 'center' }}>
          <BalanceRow label="USDC on Rome" value={ctx.evmRomeUsdc} chain="Rome — Solana" />
          <div style={{ background: 'var(--border-subtle)', alignSelf: 'stretch', width: 1 }} />
          <BalanceRow label="USDC on Sepolia" value={ctx.evmSepoliaUsdc} chain="Ethereum Sepolia" />
        </div>
      </Card>
    </div>
  );

  // ----- 4b: connected, no USDC on Rome → deposit form -----
  if (state === 'connected-empty') {
    const amt = parseFloat(ctx.depositAmount || '0') || 0;
    return (
      <div>
        {Header}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <RN n="I" size={18} />
            <h3 style={{
              fontFamily: 'var(--font-serif)', fontSize: 24, margin: 0, fontWeight: 400,
              letterSpacing: '-0.01em',
            }}>Bring USDC over from Sepolia</h3>
          </div>

          <div style={{ marginBottom: 14 }}>
            <AmountInput
              value={ctx.depositAmount}
              onChange={(v) => dispatch({ type: 'SET_DEPOSIT_AMT', value: v })}
              max={ctx.evmSepoliaUsdc}
              autoFocus
            />
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            padding: '14px 16px', borderRadius: 8,
            background: 'var(--bg-secondary)',
            marginBottom: 18,
          }}>
            <FactRow label="Time" value="~15–20 min" hint="Circle attestation" />
            <FactRow label="Fee from Rome" value="None" hint="CCTP burn fee on Sepolia" />
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!amt || amt > ctx.evmSepoliaUsdc}
            onClick={() => dispatch({ type: 'EVM_DEPOSIT_START' })}
          >
            Deposit {amt ? fmtUSDC(amt) : '0.00'} USDC
          </Button>
        </Card>
      </div>
    );
  }

  // ----- 4c: CCTP attestation in progress -----
  if (state === 'cctp-pending') {
    const stepStatus = (i) => {
      if (i < ctx.cctpStep) return 'done';
      if (i === ctx.cctpStep) return 'active';
      return 'pending';
    };
    return (
      <div>
        {Header}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Spinner size={14} color="var(--rome-purple)" />
            <Eyebrow color="var(--rome-purple)">In progress</Eyebrow>
          </div>
          <h3 style={{
            fontFamily: 'var(--font-serif)', fontSize: 28, margin: '4px 0 22px',
            fontWeight: 400, letterSpacing: '-0.015em',
          }}>
            Bringing <i>{fmtUSDC(ctx.depositAmount || 100)} USDC</i> over from Sepolia.
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <CctpStep
              numeral="I"
              status={stepStatus(0)}
              title="Sepolia burn"
              detail={stepStatus(0) === 'done'
                ? <>Burned via TokenMessenger · <TxLink href={ETHERSCAN_TX}>0xabc…1234 →</TxLink></>
                : 'Awaiting confirmation on Sepolia'}
            />
            <Hairline />
            <CctpStep
              numeral="II"
              status={stepStatus(1)}
              title="Circle attestation"
              detail={
                stepStatus(1) === 'active'
                  ? <span>Waiting for Iris signature · <span style={{ color: 'var(--fg1)' }}>~{ctx.cctpEtaMin} min remaining</span></span>
                  : (stepStatus(1) === 'done' ? 'Attestation received' : 'Estimated ~15 min')
              }
            />
            <Hairline />
            <CctpStep
              numeral="III"
              status={stepStatus(2)}
              title="Rome mint"
              detail={stepStatus(2) === 'done'
                ? <>Minted to your <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>external_auth_PDA</code> · <TxLink href={ROME_TX}>view on Solscan →</TxLink></>
                : 'Pending — Rome relayer mints once attestation arrives'}
              last
            />
          </div>

          <div style={{
            marginTop: 22, padding: '12px 14px', borderRadius: 8,
            background: 'var(--rome-blue)', fontSize: 13, color: 'var(--rome-ink)',
          }}>
            You can close this tab — the deposit will complete in the background.
            Returning here resumes the progress display.
          </div>

          {/* Demo affordance: jump steps */}
          <div style={{
            marginTop: 14, display: 'flex', gap: 10, alignItems: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--fg2)',
          }}>
            <span>Demo:</span>
            <button onClick={() => dispatch({ type: 'CCTP_ADVANCE' })} style={demoBtn}>Advance step</button>
          </div>
        </Card>
      </div>
    );
  }

  // ----- 4d: CCTP complete, has USDC on Rome → supply OR has position -----
  if (state === 'connected-funded' || state === 'has-position' || state.startsWith('tx-')) {
    return (
      <div>
        {ctx.justArrived && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 12, padding: '14px 18px', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%', background: 'var(--rome-purple)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.2 L4.8 8.5 L9.5 3.5" stroke="#FBF8F4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
            </span>
            <span style={{ fontSize: 14 }}>
              <strong style={{ fontWeight: 500 }}>{fmtUSDC(ctx.depositAmount || 100)} USDC</strong> arrived on Rome.
            </span>
            <button
              onClick={() => dispatch({ type: 'DISMISS_ARRIVED' })}
              style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg2)', fontSize: 18, padding: 0, lineHeight: 1 }}
              aria-label="Dismiss"
            >×</button>
          </div>
        )}

        {Header}

        {state === 'has-position' ? (
          <EvmPositionView ctx={ctx} dispatch={dispatch} />
        ) : (
          <EvmSupplyForm ctx={ctx} dispatch={dispatch} state={state} />
        )}

        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'EVM_BRING_MORE' })}>
            ↓ Bring more USDC over from Sepolia
          </Button>
        </div>
      </div>
    );
  }

  return null;
};

// ---------- Balance row ----------
const BalanceRow = ({ label, value, chain }) => (
  <div>
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em',
      textTransform: 'uppercase', color: 'var(--fg2)', marginBottom: 4,
    }}>{label}</div>
    <div style={{
      fontFamily: 'var(--font-serif)', fontSize: 26, letterSpacing: '-0.015em',
      color: 'var(--fg1)', fontWeight: 400, lineHeight: 1.1,
    }}>{fmtUSDC(value)}</div>
    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--fg2)', marginTop: 3 }}>{chain}</div>
  </div>
);

// ---------- Fact row ----------
const FactRow = ({ label, value, hint }) => (
  <div>
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: 'var(--fg2)', marginBottom: 3,
    }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg1)', fontWeight: 500 }}>{value}</div>
    {hint && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg2)' }}>{hint}</div>}
  </div>
);

// ---------- CCTP step row ----------
const CctpStep = ({ numeral, status, title, detail, last }) => (
  <div style={{
    display: 'flex', gap: 16, alignItems: 'flex-start',
    padding: '16px 0',
  }}>
    <StepIcon status={status} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <RN n={numeral} size={13} color="var(--fg2)" />
        <span style={{
          fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500,
          color: status === 'pending' ? 'var(--fg2)' : 'var(--fg1)',
        }}>{title}</span>
        <span style={{
          marginLeft: 'auto',
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: status === 'done' ? 'var(--rome-purple)' : (status === 'active' ? 'var(--rome-purple)' : 'var(--fg3)'),
        }}>
          {status === 'done' ? 'Done' : status === 'active' ? 'Waiting' : 'Pending'}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg2)', lineHeight: 1.5 }}>
        {detail}
      </div>
    </div>
  </div>
);

// ---------- EVM supply form ----------
const EvmSupplyForm = ({ ctx, dispatch, state }) => {
  const amt = parseFloat(ctx.supplyAmount || '0') || 0;
  const yearly = amt * (POOL_STATS.supplyApy / 100);
  const pending = state === 'tx-sign' ? 'sign' : state === 'tx-confirm' ? 'confirm' : null;
  const error = state === 'tx-error' ? 'Transaction reverted: USDC allowance insufficient.' : null;
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
          max={ctx.evmRomeUsdc}
          disabled={!!pending}
        />
      </div>
      <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 18 }}>
        You’ll earn <span style={{ color: 'var(--rome-purple)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>~${yearly.toFixed(2)}/yr</span>
        {' '}at current APY ({fmtPct(POOL_STATS.supplyApy)}).
      </div>
      {pending === 'sign' && (
        <Button variant="primary" size="lg" fullWidth disabled>
          <Spinner size={14} /> Awaiting MetaMask signature…
        </Button>
      )}
      {pending === 'confirm' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button variant="primary" size="lg" fullWidth disabled>
            <Spinner size={14} /> Confirming on Rome…
          </Button>
          <div style={{ textAlign: 'center' }}>
            <TxLink href="https://solscan.io/tx/demo">view tx on Solscan →</TxLink>
          </div>
        </div>
      )}
      {!pending && (
        <Button
          variant="primary" size="lg" fullWidth
          disabled={!amt || amt > ctx.evmRomeUsdc}
          onClick={() => dispatch({ type: 'EVM_SUPPLY_SUBMIT' })}
        >
          Supply {amt ? fmtUSDC(amt) : '0.00'} USDC
        </Button>
      )}
      {error && <InlineError message={error} onRetry={() => dispatch({ type: 'EVM_RETRY' })} />}
    </Card>
  );
};

// ---------- EVM position view (with withdraw destination toggle) ----------
const EvmPositionView = ({ ctx, dispatch }) => {
  const earned = ctx.evmPosition.earned;
  const total = ctx.evmPosition.supplied + earned;
  const wamt = parseFloat(ctx.withdrawAmount || '0') || 0;
  const dest = ctx.withdrawDest; // 'rome' | 'sepolia'
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        <RN n="I" size={18} />
        <h3 style={{
          fontFamily: 'var(--font-serif)', fontSize: 24, margin: 0, fontWeight: 400,
          letterSpacing: '-0.01em',
        }}>Your supply position</h3>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <PositionLine label="Supplied" value={fmtUSDC(ctx.evmPosition.supplied) + ' USDC'} />
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

        <div style={{ marginTop: 18, marginBottom: 6 }}>
          <Eyebrow>Where should it go?</Eyebrow>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <DestRadio
            checked={dest === 'rome'}
            onClick={() => dispatch({ type: 'SET_WITHDRAW_DEST', value: 'rome' })}
            title="Stay on Rome"
            hint="Instant — moves USDC from Compound back to your external_auth_PDA ATA"
          />
          <DestRadio
            checked={dest === 'sepolia'}
            onClick={() => dispatch({ type: 'SET_WITHDRAW_DEST', value: 'sepolia' })}
            title="Send back to Sepolia"
            hint="~15–20 min — Rome burn + Circle attestation + Sepolia mint"
          />
        </div>

        <Button
          variant="primary" size="lg" fullWidth
          style={{ marginTop: 18 }}
          disabled={!wamt || wamt > total}
          onClick={() => dispatch({ type: 'EVM_WITHDRAW' })}
        >
          Withdraw {wamt ? fmtUSDC(wamt) : '0.00'} USDC to {dest === 'rome' ? 'Rome' : 'Sepolia'}
        </Button>
      </div>
    </Card>
  );
};

// ---------- Destination radio ----------
const DestRadio = ({ checked, onClick, title, hint }) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      padding: '12px 14px',
      border: '1px solid ' + (checked ? 'var(--rome-purple)' : 'var(--border-subtle)'),
      background: checked ? 'rgba(94,10,96,0.03)' : 'transparent',
      borderRadius: 8, cursor: 'pointer',
      transition: 'all 160ms',
    }}
  >
    <span style={{
      width: 16, height: 16, borderRadius: '50%',
      border: '1.5px solid ' + (checked ? 'var(--rome-purple)' : 'var(--border-strong)'),
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, marginTop: 2,
    }}>
      {checked && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--rome-purple)' }} />}
    </span>
    <div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14.5, fontWeight: 500, color: 'var(--fg1)' }}>{title}</div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--fg2)', marginTop: 2 }}>{hint}</div>
    </div>
  </div>
);

const demoBtn = {
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
  textTransform: 'uppercase',
  background: 'transparent', border: '1px solid var(--border-default)',
  padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
  color: 'var(--rome-ink)',
};

Object.assign(window, { EvmLane, BalanceRow, FactRow, CctpStep, EvmSupplyForm, EvmPositionView, DestRadio });
