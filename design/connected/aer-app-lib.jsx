// =====================================================================
// AERARIUM — connected app · shared components (light, editorial)
// LaneHeader, LaneIndicator, AccountChip, PositionSummary, AssetTable,
// ActionPanel, ProgressCard, ActivityFeed, ConnectCard, ActivateCard.
// Presentational only — state lives in aer-lane.jsx.
// =====================================================================
const { useState: useS, useEffect: useE, useRef: useR } = React;

// ---- small bits -----------------------------------------------------
const Spin = ({ size = 15, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'aer-spin 0.9s linear infinite', flexShrink: 0 }}>
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.5" fill="none" opacity="0.22" />
    <path d="M12 3 a9 9 0 0 1 9 9" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
  </svg>
);
const Check = ({ size = 13, bg = 'var(--pos)' }) => (
  <span style={{ width: size + 9, height: size + 9, borderRadius: '50%', background: bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2 L4.8 8.5 L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);
const AssetIcon = ({ sym, tone = 'var(--marble-2)', size = 34 }) => (
  <span style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    border: '1px solid var(--stone-line-2)', background: 'var(--paper)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-mono)', fontSize: size * 0.3, color: tone, fontWeight: 600,
  }}>{sym.slice(0, 2).toUpperCase()}</span>
);
const eyebrow = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--marble-3)' };
const num = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' };
const fmt$ = (n, dp = 2) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const short = (a) => a.length > 13 ? a.slice(0, 6) + '…' + a.slice(-4) : a;

// ---- Lane indicator chip -------------------------------------------
const LaneIndicator = ({ chain }) => {
  const c = CHAIN[chain];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 13px', borderRadius: 'var(--r-pill)',
      background: 'var(--lane-wash)', border: '1px solid var(--lane)',
      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: 'var(--lane)', fontWeight: 500,
    }}>
      <ChainGlyph chain={chain} size={14} /> {c.label} Gate
    </span>
  );
};

// ---- Account chip ---------------------------------------------------
const AccountChip = ({ address, wallet, onDisconnect }) => {
  const [copied, setCopied] = useS(false);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <span
        onClick={() => { navigator.clipboard?.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1100); }}
        title="Copy address"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          padding: '6px 13px 6px 11px', borderRadius: 'var(--r-pill)',
          border: '1px solid var(--stone-line-2)', background: 'var(--basalt)',
        }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pos)' }} />
        {wallet && <span style={{ ...eyebrow, color: 'var(--marble-3)' }}>{wallet}</span>}
        <span style={{ ...num, fontSize: 13, color: 'var(--marble)' }}>{copied ? 'copied' : short(address)}</span>
      </span>
      <button onClick={onDisconnect} style={{ background: 'none', border: 'none', cursor: 'pointer', ...eyebrow, textTransform: 'none', fontSize: 12.5, color: 'var(--marble-3)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Disconnect</button>
    </div>
  );
};

// ---- Lane header ----------------------------------------------------
const LaneHeader = ({ chain, account, onDisconnect }) => (
  <div style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(251,248,244,0.86)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--stone-line)' }}>
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <a href="Aerarium — Landing.html" style={{ textDecoration: 'none' }}><Wordmark size={18} sub={false} /></a>
        <span style={{ width: 1, height: 26, background: 'var(--stone-line-2)' }} />
        <LaneIndicator chain={chain} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <a href="Aerarium — Landing.html" style={{ ...eyebrow, color: 'var(--marble-2)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>← Dashboard</a>
        {account && <AccountChip {...account} onDisconnect={onDisconnect} />}
      </div>
    </div>
  </div>
);

// ---- Position summary ----------------------------------------------
const PositionSummary = ({ supplied, borrowed, capacity, healthFactor, netApr, empty }) => {
  const used = capacity > 0 ? Math.min(100, (borrowed / capacity) * 100) : 0;
  const hf = healthFactor;
  const hfColor = hf >= 2 ? 'var(--pos)' : hf >= 1.25 ? 'var(--gold-bright)' : 'var(--oxblood-br)';
  return (
    <div className="aer-card" style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <h2 className="aer-display" style={{ fontSize: 22, margin: 0, fontWeight: 400 }}>Your position</h2>
        <span style={{ ...eyebrow }}>Shared pool · Rome</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        <Metric label="Supplied" value={empty ? '—' : fmt$(supplied)} tone="var(--marble)" />
        <Metric label="Borrowed" value={empty ? '—' : fmt$(borrowed)} tone="var(--marble)" />
        <Metric label="Net APR" value={empty ? '—' : (netApr >= 0 ? '+' : '') + netApr.toFixed(2) + '%'} tone="var(--gold-bright)" />
        <Metric label="Health" value={empty ? '—' : hf.toFixed(2)} tone={hfColor} />
      </div>
      {!empty && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={eyebrow}>Borrow capacity used</span>
            <span style={{ ...num, fontSize: 12, color: 'var(--marble-2)' }}>{fmt$(borrowed, 0)} / {fmt$(capacity, 0)}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--paper)', overflow: 'hidden', border: '1px solid var(--stone-line)' }}>
            <div style={{ height: '100%', width: used + '%', background: used > 85 ? 'var(--oxblood-br)' : 'linear-gradient(90deg, var(--lane-deep), var(--lane))', transition: 'width 0.8s var(--ease)' }} />
          </div>
        </div>
      )}
    </div>
  );
};
const Metric = ({ label, value, tone }) => (
  <div>
    <div style={{ ...eyebrow, marginBottom: 8 }}>{label}</div>
    <div style={{ ...num, fontSize: 26, fontWeight: 600, color: tone, lineHeight: 1 }}>{value}</div>
  </div>
);

// ---- Asset table ----------------------------------------------------
const AssetTable = ({ title, assets, onAction, activeSym }) => (
  <div className="aer-card" style={{ padding: '8px 0', overflow: 'hidden' }}>
    <div style={{ padding: '16px 24px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h3 className="aer-display" style={{ fontSize: 18, margin: 0, fontWeight: 400 }}>{title}</h3>
    </div>
    <div style={{
      display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1.1fr auto', gap: 14, padding: '0 24px 10px',
      borderBottom: '1px solid var(--stone-line)', ...eyebrow,
    }}>
      <span>Asset</span><span>Supply APY</span><span>Borrow APY</span><span>Your balance</span><span></span>
    </div>
    {assets.map((a) => <AssetRow key={a.sym} a={a} onAction={onAction} active={a.sym === activeSym} />)}
  </div>
);

const AssetRow = ({ a, onAction, active }) => {
  const [h, setH] = useS(false);
  const bal = a.suppliedBal > 0 ? a.suppliedBal : a.borrowedBal > 0 ? -a.borrowedBal : a.walletBal;
  const balLabel = a.suppliedBal > 0 ? 'supplied' : a.borrowedBal > 0 ? 'borrowed' : 'in wallet';
  const balVal = a.suppliedBal > 0 ? a.suppliedBal : a.borrowedBal > 0 ? a.borrowedBal : a.walletBal;
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1.1fr auto', gap: 14, alignItems: 'center',
        padding: '16px 24px', borderBottom: '1px solid var(--stone-line)',
        background: active ? 'var(--lane-wash)' : h ? 'var(--paper)' : 'transparent',
        borderLeft: '2px solid ' + (active ? 'var(--lane)' : 'transparent'), transition: 'background var(--dur)',
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AssetIcon sym={a.sym} tone={a.collateral ? 'var(--lane)' : 'var(--gold)'} />
        <span>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--marble)' }}>{a.sym}</span>
          <span style={{ ...eyebrow, textTransform: 'none', letterSpacing: 0, fontSize: 11.5 }}>{a.name}</span>
        </span>
      </span>
      <span style={{ ...num, fontSize: 14, color: 'var(--pos)', fontWeight: 600 }}>{a.supplyApy.toFixed(2)}%</span>
      <span style={{ ...num, fontSize: 14, color: a.borrowApy ? 'var(--marble)' : 'var(--marble-4)', fontWeight: 600 }}>{a.borrowApy ? a.borrowApy.toFixed(2) + '%' : '—'}</span>
      <span>
        <span style={{ ...num, display: 'block', fontSize: 14, color: 'var(--marble)' }}>{balVal > 0 ? fmt$(balVal) : '—'}</span>
        {balVal > 0 && <span style={{ ...eyebrow, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>{balLabel}</span>}
      </span>
      <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="outline" size="sm" onClick={() => onAction('supply', a)}>Supply</Button>
        {a.borrowApy
          ? <Button variant="gold" size="sm" onClick={() => onAction('borrow', a)}>Borrow</Button>
          : <Button variant="ghost" size="sm" onClick={() => onAction('withdraw', a)}>Manage</Button>}
      </span>
    </div>
  );
};

// ---- Action panel ---------------------------------------------------
const ACTIONS = { supply: 'Supply', withdraw: 'Withdraw', borrow: 'Borrow', repay: 'Repay' };
const ActionPanel = ({ asset, action, amount, onAmount, onAction, onActionType, apr, projected, submitLabel, busy }) => {
  const tabs = asset?.borrowApy ? ['supply', 'withdraw', 'borrow', 'repay'] : ['supply', 'withdraw'];
  return (
    <div className="aer-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <AssetIcon sym={asset.sym} tone={asset.collateral ? 'var(--lane)' : 'var(--gold)'} size={30} />
        <h3 className="aer-display" style={{ fontSize: 19, margin: 0, fontWeight: 400 }}>{asset.sym}</h3>
      </div>
      {/* action tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--paper)', borderRadius: 'var(--r-md)', marginBottom: 20 }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => onActionType(t)} style={{
            flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', borderRadius: 'var(--r-sm)',
            background: action === t ? 'var(--basalt)' : 'transparent',
            boxShadow: action === t ? '0 1px 2px rgba(20,2,24,0.1)' : 'none',
            fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
            color: action === t ? 'var(--marble)' : 'var(--marble-3)', textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>{ACTIONS[t]}</button>
        ))}
      </div>
      {/* amount */}
      <div style={{ border: '1px solid var(--stone-line-2)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={eyebrow}>Amount</span>
          <span style={{ ...eyebrow, textTransform: 'none', letterSpacing: 0 }}>{ACTIONS[action]} {asset.sym}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input className="aer-input" value={amount} onChange={(e) => onAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" disabled={busy} />
          <span style={{ ...eyebrow, fontSize: 12 }}>{asset.sym}</span>
          <button onClick={() => onAmount(String(asset.max ?? 0))} disabled={busy} style={{ ...eyebrow, border: '1px solid var(--stone-line-2)', background: 'transparent', borderRadius: 999, padding: '5px 9px', cursor: 'pointer', color: 'var(--marble)' }}>Max</button>
        </div>
      </div>
      {/* projected rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {projected.map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--marble-2)' }}>{p.k}</span>
            <span style={{ ...num, color: p.tone || 'var(--marble)', fontWeight: 500 }}>{p.v}</span>
          </div>
        ))}
      </div>
      <Button variant="gold" size="lg" full onClick={onAction}>{submitLabel}</Button>
    </div>
  );
};

// ---- Progress card (in-flight signing) ------------------------------
const ProgressCard = ({ title, note, steps, current, onCancel }) => (
  <div className="aer-card" style={{ padding: 24 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <Spin size={15} color="var(--lane)" />
      <h3 className="aer-display" style={{ fontSize: 19, margin: 0, fontWeight: 400 }}>{title}</h3>
    </div>
    {note && <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--marble-2)', lineHeight: 1.55 }}>{note}</p>}
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {steps.map((s, i) => {
        const st = i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < steps.length - 1 ? '1px solid var(--stone-line)' : 'none' }}>
            {st === 'done' ? <Check size={12} /> : st === 'active'
              ? <span style={{ width: 21, height: 21, borderRadius: '50%', border: '1.5px solid var(--lane)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--lane)' }}><Spin size={11} /></span>
              : <span style={{ width: 21, height: 21, borderRadius: '50%', border: '1.5px solid var(--stone-line-2)', flexShrink: 0 }} />}
            <span style={{ flex: 1, fontSize: 14, color: st === 'todo' ? 'var(--marble-3)' : 'var(--marble)', fontWeight: st === 'active' ? 600 : 400 }}>{s.label}</span>
            <span style={{ ...eyebrow, fontSize: 10 }}>{s.tag || (st === 'done' ? 'Done' : st === 'active' ? 'Sign' : 'Wait')}</span>
          </div>
        );
      })}
    </div>
    {onCancel && <button onClick={onCancel} style={{ marginTop: 16, background: 'none', border: 'none', cursor: 'pointer', ...eyebrow, textTransform: 'none', color: 'var(--marble-3)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Cancel</button>}
  </div>
);

// ---- Activity feed --------------------------------------------------
const ActivityFeed = ({ items }) => (
  <div className="aer-card" style={{ padding: 24 }}>
    <h3 className="aer-display" style={{ fontSize: 18, margin: '0 0 16px', fontWeight: 400 }}>Recent activity</h3>
    {items.length === 0
      ? <p style={{ margin: 0, fontSize: 13.5, color: 'var(--marble-3)' }}>No activity yet — your first action will appear here.</p>
      : items.map((it) => (
        <div key={it.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'baseline', padding: '11px 0', borderBottom: '1px solid var(--stone-line)' }}>
          <span style={{ ...eyebrow, fontSize: 10.5, width: 70 }}>{it.time}</span>
          <span style={{ fontSize: 13.5, color: 'var(--marble)' }}><strong style={{ fontWeight: 600 }}>{it.verb}</strong> <span style={num}>{fmt$(it.amount)}</span> {it.sym}</span>
          <a href="#" style={{ ...eyebrow, fontSize: 10.5, color: 'var(--lane)', textDecoration: 'none' }}>tx →</a>
        </div>
      ))}
  </div>
);

// ---- Connect card (disconnected) ------------------------------------
const ConnectCard = ({ chain, wallets, connecting, onConnect }) => {
  const c = CHAIN[chain];
  return (
    <div className="aer-card" style={{ padding: 48, textAlign: 'center', maxWidth: 560, margin: '40px auto 0' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><ChainGlyph chain={chain} size={44} /></div>
      <h2 className="aer-display" style={{ fontSize: 32, margin: 0, fontWeight: 400 }}>Enter the {c.label} Gate</h2>
      <p style={{ margin: '14px auto 28px', fontSize: 16, color: 'var(--marble-2)', maxWidth: 400, lineHeight: 1.6 }}>
        Connect your {c.label} wallet to supply, borrow, and manage your position in the shared pool.
      </p>
      {connecting ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'var(--lane)', fontSize: 15 }}>
          <Spin size={16} color="var(--lane)" /> Connecting to {connecting}…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
          {wallets.map((w, i) => (
            <button key={w} onClick={() => onConnect(w)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px',
              border: '1px solid ' + (i === 0 ? 'var(--lane)' : 'var(--stone-line-2)'), borderRadius: 'var(--r-md)',
              background: i === 0 ? 'var(--lane-wash)' : 'var(--basalt)', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600, color: 'var(--marble)',
            }}>
              {w} <span style={{ color: 'var(--lane)' }}>→</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ marginTop: 26 }}><a href="Aerarium — Landing.html" style={{ ...eyebrow, textTransform: 'none', color: 'var(--marble-3)', textDecoration: 'none' }}>← Back to dashboard</a></div>
    </div>
  );
};

Object.assign(window, {
  Spin, Check, AssetIcon, LaneIndicator, AccountChip, LaneHeader,
  PositionSummary, Metric, AssetTable, AssetRow, ActionPanel, ACTIONS,
  ProgressCard, ActivityFeed, ConnectCard, fmt$, short, aerEyebrow: eyebrow, aerNum: num,
});
