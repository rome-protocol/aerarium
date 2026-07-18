// =====================================================================
// AERARIUM — The Arena (head-to-head liquidation scoreboard)
// EVM vs Solana: who liquidated more of whom, value seized, biggest hit.
// =====================================================================

const Arena = () => {
  const e = ARENA.evm, s = ARENA.sol;
  const totalSeized = e.valueSeized + s.valueSeized;
  const solLeadPct = (s.valueSeized / totalSeized) * 100;
  const leader = s.valueSeized > e.valueSeized ? 'sol' : 'evm';

  return (
    <Section id="arena" style={{ paddingTop: 96, paddingBottom: 96 }}>
      {/* header with laurel + standings flag */}
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><Meander w={150} /></div>
        <div className="aer-eyebrow" style={{ marginBottom: 16 }}>The Arena · Last 30 days</div>
        <h2 className="aer-display" style={{ fontSize: 'clamp(36px, 5vw, 56px)', margin: 0, fontWeight: 400 }}>
          Who is liquidating whom?
        </h2>
        <p style={{ maxWidth: 640, margin: '18px auto 0', fontSize: 17, color: 'var(--marble-2)', lineHeight: 1.6 }}>
          One pool means one battlefield. When a position goes underwater, liquidators from either chain can seize it —
          and they keep score. This is the cross-VM rivalry, made legible.
        </p>
      </div>

      {/* The scoreboard */}
      <div style={{
        marginTop: 48,
        border: '1px solid var(--stone-line-2)', borderRadius: 'var(--r-lg)',
        background: 'linear-gradient(180deg, var(--basalt), var(--obsidian))',
        overflow: 'hidden',
      }}>
        {/* Combatant banner */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
          <Combatant chain="evm" leading={leader === 'evm'} align="left" />
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, color: 'var(--gold)',
            padding: '0 18px', letterSpacing: '0.04em', textShadow: '0 0 24px rgba(196,106,208,0.45)',
          }}>VS</div>
          <Combatant chain="sol" leading={leader === 'sol'} align="right" />
        </div>

        {/* Tug-of-war standings bar (by value seized) */}
        <div style={{ padding: '0 32px 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--evm-bright)' }}>{fmtCompact(e.valueSeized)} seized</span>
            <span className="aer-eyebrow" style={{ color: 'var(--marble-3)' }}>Total value seized</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sol-bright)' }}>{fmtCompact(s.valueSeized)} seized</span>
          </div>
          <TugBar solPct={solLeadPct} />
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: leader === 'sol' ? 'var(--sol-bright)' : 'var(--evm-bright)',
            }}>
              {leader === 'sol' ? 'Solana' : 'Ethereum'} leads by {fmtCompact(Math.abs(s.valueSeized - e.valueSeized))}
            </span>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--stone-line)', margin: '24px 0 0' }} />

        {/* Stat rows */}
        <StatRow label="Liquidations won" evm={e.liquidationsWon} sol={s.liquidationsWon} />
        <StatRow label="Value seized" evm={e.valueSeized} sol={s.valueSeized} money />
        <StatRow label="Biggest single hit" evm={e.biggestHit} sol={s.biggestHit} money />
        <StatRow label="Positions defended" evm={e.positionsDefended} sol={s.positionsDefended} />
        <StatRow label="Current win streak" evm={e.streak} sol={s.streak} suffix=" days" last />
      </div>

      <p style={{ textAlign: 'center', marginTop: 22, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--marble-3)', letterSpacing: '0.04em' }}>
        Standings reset monthly · Liquidator rewards paid from the shared pool
      </p>
    </Section>
  );
};

const Combatant = ({ chain, leading, align }) => {
  const c = CHAIN[chain];
  return (
    <div style={{
      padding: '28px 32px',
      background: leading ? c.wash : 'transparent',
      borderBottom: `2px solid ${leading ? c.color : 'transparent'}`,
      textAlign: align,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
        {align === 'left' && <ChainGlyph chain={chain} size={30} />}
        <div style={{ textAlign: align }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, color: c.bright, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {c.label}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: leading ? 'var(--gold)' : 'var(--marble-3)', marginTop: 4 }}>
            {leading ? '★ Leading' : 'Challenger'}
          </div>
        </div>
        {align === 'right' && <ChainGlyph chain={chain} size={30} />}
      </div>
    </div>
  );
};

const TugBar = ({ solPct }) => {
  const ref = useRef(null);
  const seen = useInView(ref);
  const sp = seen ? solPct : 50;
  return (
    <div ref={ref} style={{ position: 'relative', height: 16 }}>
      <div style={{ display: 'flex', height: '100%', borderRadius: 'var(--r-pill)', overflow: 'hidden', border: '1px solid var(--stone-line-2)' }}>
        <div style={{ width: `${100 - sp}%`, background: 'linear-gradient(90deg, var(--evm-deep), var(--evm))', transition: 'width 1.2s var(--ease)' }} />
        <div style={{ width: `${sp}%`, background: 'linear-gradient(90deg, var(--sol), var(--sol-deep))', transition: 'width 1.2s var(--ease)' }} />
      </div>
      {/* center marker */}
      <div style={{ position: 'absolute', left: '50%', top: -4, bottom: -4, width: 2, background: 'var(--gold)', opacity: 0.6, transform: 'translateX(-50%)' }} />
    </div>
  );
};

const StatRow = ({ label, evm, sol, money, suffix = '', last }) => {
  const total = evm + sol || 1;
  const evmWins = evm > sol;
  const fmt = (v) => money ? fmtCompact(v) : v.toLocaleString('en-US') + suffix;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 200px 1fr', alignItems: 'center', gap: 20,
      padding: '18px 32px',
      borderBottom: last ? 'none' : '1px solid var(--stone-line)',
    }}>
      {/* EVM value */}
      <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        {evmWins && <Crown />}
        <span className="aer-num" style={{ fontSize: 22, fontWeight: 600, color: evmWins ? 'var(--evm-bright)' : 'var(--marble-2)' }}>{fmt(evm)}</span>
      </div>
      {/* label + dual mini-bar */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--marble-3)', marginBottom: 8 }}>{label}</div>
        <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'var(--basalt)' }}>
          <div style={{ flex: evm, background: 'var(--evm)' }} />
          <div style={{ width: 2 }} />
          <div style={{ flex: sol, background: 'var(--sol)' }} />
        </div>
      </div>
      {/* SOL value */}
      <div style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="aer-num" style={{ fontSize: 22, fontWeight: 600, color: !evmWins ? 'var(--sol-bright)' : 'var(--marble-2)' }}>{fmt(sol)}</span>
        {!evmWins && <Crown />}
      </div>
    </div>
  );
};

const Crown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <path d="M3 7 L7 11 L12 5 L17 11 L21 7 L19 19 L5 19 Z" fill="var(--gold)" />
  </svg>
);

Object.assign(window, { Arena });
