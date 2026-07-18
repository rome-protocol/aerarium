// =====================================================================
// AERARIUM — sections part 2: Liquidations, Choose Your Gate, Markets, Footer
// =====================================================================

// ---------------------------------------------------------------------
// OPEN FOR LIQUIDATION — claimable underwater positions
// ---------------------------------------------------------------------
const Liquidations = ({ onConnect }) => (
  <Section id="liquidations" style={{ paddingTop: 96, paddingBottom: 96 }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, marginBottom: 32 }}>
      <SectionHead
        eyebrow="Open for liquidation"
        title="Underwater. Unclaimed. Yours to take."
        intro="These positions have crossed the line. Any liquidator can repay the debt and seize the collateral at a bonus — from either chain."
        titleSize={40}
      />
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--marble-3)',
        textAlign: 'right', whiteSpace: 'nowrap',
      }}>
        <div style={{ color: 'var(--gold)', fontSize: 26, fontWeight: 600 }} className="aer-num">{LIQUIDATIONS.length}</div>
        positions open now
      </div>
    </div>

    {/* table header */}
    <div style={{
      display: 'grid', gridTemplateColumns: '120px 1.4fr 1fr 0.9fr 1fr auto', gap: 16,
      padding: '0 20px 12px', borderBottom: '1px solid var(--stone-line)',
      fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.16em',
      textTransform: 'uppercase', color: 'var(--marble-3)',
    }}>
      <span>Side</span><span>Borrower</span><span>Collateral</span><span>Health</span><span style={{ color: 'var(--gold)' }}>Your reward</span><span></span>
    </div>

    <div>
      {LIQUIDATIONS.map((p, i) => <LiqRow key={p.id} p={p} onConnect={onConnect} idx={i} />)}
    </div>

    <div style={{
      marginTop: 24, padding: '18px 22px', borderRadius: 'var(--r-md)',
      border: '1px dashed var(--stone-line-2)', background: 'var(--gold-wash)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 15, color: 'var(--marble-2)' }}>
        <strong style={{ color: 'var(--marble)', fontWeight: 600 }}>Connect to claim.</strong> Your gate decides your side — Ethereum or Solana.
      </span>
      <Button variant="gold" size="md" onClick={onConnect}>Connect to claim →</Button>
    </div>
  </Section>
);

const LiqRow = ({ p, onConnect, idx }) => {
  const [h, setH] = useState(false);
  const c = CHAIN[p.side];
  return (
    <div
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: 'grid', gridTemplateColumns: '120px 1.4fr 1fr 0.9fr 1fr auto', gap: 16, alignItems: 'center',
        padding: '18px 20px', borderBottom: '1px solid var(--stone-line)',
        background: h ? c.wash : 'transparent', transition: 'background var(--dur)',
        borderLeft: `2px solid ${h ? c.color : 'transparent'}`,
      }}>
      <span><ChainBadge chain={p.side} size="sm" /></span>
      <span className="aer-mono" style={{ fontSize: 13.5, color: 'var(--marble)' }}>{p.borrower}</span>
      <span>
        <span style={{ fontSize: 14, color: 'var(--marble)', fontWeight: 500 }}>{p.collateral}</span>
        <span className="aer-num" style={{ fontSize: 12, color: 'var(--marble-3)', marginLeft: 8 }}>{fmtCompact(p.collateralUsd)}</span>
      </span>
      <span className="aer-num" style={{ fontSize: 14, color: 'var(--oxblood-br)', fontWeight: 600 }}>{p.health.toFixed(2)}</span>
      <span className="aer-num" style={{ fontSize: 16, color: 'var(--gold)', fontWeight: 600 }}>{fmtCompact(p.reward)}</span>
      <span style={{ textAlign: 'right' }}>
        <Button variant="chain" chain={p.side} size="sm" onClick={onConnect}>Claim</Button>
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------
// CHOOSE YOUR GATE — the conversion CTA
// ---------------------------------------------------------------------
const Gates = ({ onConnect }) => (
  <Section id="gates" style={{ paddingTop: 96, paddingBottom: 96 }}>
    <div style={{ textAlign: 'center', marginBottom: 44 }}>
      <div className="aer-eyebrow" style={{ marginBottom: 16 }}>Choose your gate</div>
      <h2 className="aer-display" style={{ fontSize: 'clamp(36px, 5vw, 56px)', margin: 0, fontWeight: 400 }}>
        Two gates. One treasury.
      </h2>
      <p style={{ maxWidth: 600, margin: '18px auto 0', fontSize: 17, color: 'var(--marble-2)', lineHeight: 1.6 }}>
        Enter from the chain you already hold. Your wallet is your side — and your standing in the arena.
      </p>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
      <GateCard chain="evm" title="The Ethereum Gate" wallets={['MetaMask', 'Rabby', 'WalletConnect']} onConnect={onConnect} />
      <GateCard chain="sol" title="The Solana Gate" wallets={['Phantom', 'Solflare', 'Backpack']} onConnect={onConnect} />
    </div>
  </Section>
);

const GateCard = ({ chain, title, wallets, onConnect }) => {
  const [h, setH] = useState(false);
  const c = CHAIN[chain];
  return (
    <div
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        position: 'relative', overflow: 'hidden',
        border: `1px solid ${h ? c.color : 'var(--stone-line-2)'}`,
        borderRadius: 'var(--r-lg)', padding: '40px 36px',
        background: h ? `linear-gradient(180deg, ${c.wash}, var(--obsidian))` : 'linear-gradient(180deg, var(--basalt), var(--obsidian))',
        transition: 'all var(--dur) var(--ease)',
        transform: h ? 'translateY(-3px)' : 'none',
        boxShadow: h ? `0 24px 60px -24px ${c.color}` : 'none',
      }}>
      {/* gate arch motif */}
      <GateArch chain={chain} />

      <div style={{ position: 'relative' }}>
        <ChainBadge chain={chain} />
        <h3 className="aer-display" style={{ fontSize: 30, fontWeight: 400, margin: '20px 0 10px', color: 'var(--marble)' }}>{title}</h3>
        <p style={{ margin: '0 0 28px', fontSize: 14.5, color: 'var(--marble-2)', lineHeight: 1.6 }}>
          {chain === 'evm'
            ? 'Supply and borrow with the assets you already hold on Ethereum. Fight for Ethereum in the arena.'
            : 'Bring your Solana liquidity into the same market. Carry the violet into every liquidation.'}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
          {wallets.map((w) => (
            <span key={w} style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--marble-2)',
              border: '1px solid var(--stone-line-2)', borderRadius: 'var(--r-sm)', padding: '5px 11px',
            }}>{w}</span>
          ))}
        </div>

        <Button variant="chain" chain={chain} size="lg" full onClick={onConnect}>
          Enter the {chain === 'evm' ? 'Ethereum' : 'Solana'} Gate →
        </Button>
      </div>
    </div>
  );
};

// A Roman arch / gate drawn in SVG, tinted to the chain
const GateArch = ({ chain }) => {
  const c = CHAIN[chain];
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true" style={{
      position: 'absolute', right: -20, top: -20, width: 200, height: 200, opacity: 0.14,
    }}>
      <path d="M40 180 V90 A60 60 0 0 1 160 90 V180" fill="none" stroke={c.bright} strokeWidth="3" />
      <path d="M64 180 V96 A36 36 0 0 1 136 96 V180" fill="none" stroke={c.bright} strokeWidth="2" />
      <rect x="30" y="180" width="140" height="8" fill={c.bright} />
      <rect x="34" y="60" width="132" height="6" fill={c.bright} opacity="0.6" />
    </svg>
  );
};

// ---------------------------------------------------------------------
// MARKETS — read-only rates table
// ---------------------------------------------------------------------
const Markets = () => (
  <Section id="markets" style={{ paddingTop: 96, paddingBottom: 96 }}>
    <SectionHead eyebrow="Markets" title="Rates across the treasury" intro="Live supply and borrow rates for every asset in the pool. Read-only — connect a gate to act." titleSize={40} />

    <div style={{
      marginTop: 32, border: '1px solid var(--stone-line-2)', borderRadius: 'var(--r-lg)', overflow: 'hidden',
      background: 'linear-gradient(180deg, var(--basalt), var(--obsidian))',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.2fr 1fr 1fr', gap: 16,
        padding: '16px 24px', borderBottom: '1px solid var(--stone-line)',
        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--marble-3)',
      }}>
        <span>Asset</span><span>Supply APY</span><span>Borrow APY</span><span>Total supplied</span><span>Utilization</span><span>Gates</span>
      </div>
      {MARKETS.map((m, i) => <MarketRow key={m.asset} m={m} last={i === MARKETS.length - 1} />)}
    </div>
  </Section>
);

const MarketRow = ({ m, last }) => {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.2fr 1fr 1fr', gap: 16, alignItems: 'center',
      padding: '18px 24px', borderBottom: last ? 'none' : '1px solid var(--stone-line)',
      background: h ? 'rgba(244,238,226,0.03)' : 'transparent', transition: 'background var(--dur)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--stone-line-2)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--marble-2)', flexShrink: 0,
        }}>{m.asset.slice(0, 2)}</span>
        <span>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--marble)' }}>{m.asset}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--marble-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{m.kind}</span>
        </span>
      </span>
      <span className="aer-num" style={{ fontSize: 15, color: 'var(--pos)', fontWeight: 600 }}>{m.supplyApy.toFixed(2)}%</span>
      <span className="aer-num" style={{ fontSize: 15, color: 'var(--marble)', fontWeight: 600 }}>{m.borrowApy.toFixed(2)}%</span>
      <span className="aer-num" style={{ fontSize: 14, color: 'var(--marble-2)' }}>{fmtCompact(m.total)}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--basalt-2)', overflow: 'hidden', maxWidth: 64 }}>
          <span style={{ display: 'block', height: '100%', width: `${m.util}%`, background: 'var(--gold)' }} />
        </span>
        <span className="aer-num" style={{ fontSize: 12.5, color: 'var(--marble-3)' }}>{m.util}%</span>
      </span>
      <span style={{ display: 'flex', gap: 6 }}>
        {m.chains.map((ch) => <ChainGlyph key={ch} chain={ch} size={18} />)}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------
// FOOTER
// ---------------------------------------------------------------------
const Footer = () => (
  <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid var(--stone-line)', marginTop: 40 }}>
    <Section style={{ paddingTop: 56, paddingBottom: 56 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap', marginBottom: 40 }}>
        <div style={{ maxWidth: 320 }}>
          <Wordmark size={22} />
          <p style={{ marginTop: 18, fontSize: 13.5, color: 'var(--marble-3)', lineHeight: 1.6 }}>
            One pool. Two rival chains. A cross-VM money market on the Rome network.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 56, flexWrap: 'wrap' }}>
          <FootCol title="Protocol" links={['The Pool', 'The Arena', 'Markets', 'Liquidations']} />
          <FootCol title="Build" links={['Docs', 'GitHub', 'Audits', 'Bug bounty']} />
          <FootCol title="Network" links={['Rome', 'Bridge status', 'Explorer']} />
        </div>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20,
        paddingTop: 26, borderTop: '1px solid var(--stone-line)', flexWrap: 'wrap',
      }}>
        <RomeLockup size={20} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--marble-3)' }}>
          Aerarium · Testnet · {new Date().getFullYear()}
        </span>
        <NetPill>Rome · Testnet</NetPill>
      </div>
    </Section>
  </footer>
);

const FootCol = ({ title, links }) => (
  <div>
    <div className="aer-eyebrow" style={{ color: 'var(--marble-3)', marginBottom: 14 }}>{title}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {links.map((l) => (
        <a key={l} href="#" style={{ fontSize: 13.5, color: 'var(--marble-2)', textDecoration: 'none' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--gold)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--marble-2)'}
        >{l}</a>
      ))}
    </div>
  </div>
);

Object.assign(window, { Liquidations, Gates, GateCard, GateArch, Markets, Footer, FootCol });
