// =====================================================================
// AERARIUM — sections part 1: Nav, Hero, Shared Pool, The Arena
// =====================================================================

// ---------------------------------------------------------------------
// NAV — wordmark · links · Rome testnet pill · Connect
// ---------------------------------------------------------------------
const Nav = ({ onConnect }) => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const links = [
    { label: 'The Pool', href: '#pool' },
    { label: 'The Arena', href: '#arena' },
    { label: 'Liquidations', href: '#liquidations' },
    { label: 'Markets', href: '#markets' },
  ];
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: scrolled ? 'rgba(16,12,14,0.82)' : 'transparent',
      backdropFilter: scrolled ? 'blur(16px) saturate(140%)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(16px) saturate(140%)' : 'none',
      borderBottom: scrolled ? '1px solid var(--stone-line)' : '1px solid transparent',
      transition: 'all var(--dur) var(--ease)',
    }}>
      <div style={{
        maxWidth: 'var(--maxw)', margin: '0 auto', padding: '16px var(--gutter)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
      }}>
        <a href="#top" style={{ textDecoration: 'none' }}><Wordmark size={20} sub={false} /></a>
        <nav style={{ display: 'flex', gap: 30 }}>
          {links.map((l) => (
            <a key={l.href} href={l.href} style={{
              fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 500,
              color: 'var(--marble-2)', letterSpacing: '0.02em',
              textTransform: 'uppercase', transition: 'color var(--dur)',
            }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--marble)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--marble-2)'}
            >{l.label}</a>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="aer-hide-sm"><NetPill>Rome · Testnet</NetPill></span>
          <Button variant="gold" size="md" onClick={onConnect}>Connect</Button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// Decorative fluted column (used to flank the hero)
// ---------------------------------------------------------------------
const Column = ({ side, tint }) => (
  <div aria-hidden="true" style={{
    position: 'absolute', top: 0, bottom: 0, width: 120,
    [side]: 0, pointerEvents: 'none', opacity: 0.5,
    background: `linear-gradient(90deg,
      ${side === 'left' ? 'transparent, ' + tint : tint + ', transparent'})`,
    maskImage: 'repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 14px)',
    WebkitMaskImage: 'repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 14px)',
  }} />
);

// ---------------------------------------------------------------------
// HERO — "One pool. Two rival chains."
// ---------------------------------------------------------------------
const Hero = ({ onGate, heroVariant = 'rival' }) => (
  <header id="top" style={{ position: 'relative', overflow: 'hidden', paddingTop: 56, paddingBottom: 8 }}>
    {/* flanking column glows */}
    <Column side="left" tint="var(--evm-wash)" />
    <Column side="right" tint="var(--sol-wash)" />

    <Section style={{ textAlign: 'center', position: 'relative', paddingTop: 40, paddingBottom: 48 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 12,
          fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: '0.24em',
          textTransform: 'uppercase', color: 'var(--marble-3)',
          border: '1px solid var(--stone-line-2)', borderRadius: 'var(--r-pill)', padding: '7px 18px',
        }}>
          <ChainGlyph chain="evm" size={14} /> A money market on Rome <ChainGlyph chain="sol" size={14} />
        </span>
      </div>

      <h1 className="aer-display" style={{
        fontSize: 'clamp(44px, 7vw, 88px)', margin: 0, fontWeight: 400, lineHeight: 1.02,
        letterSpacing: '-0.02em',
      }}>
        One pool.<br />
        Two <span style={{
          background: 'linear-gradient(90deg, var(--evm-bright) 0%, var(--gold-bright) 50%, var(--sol-bright) 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>{heroVariant === 'gates' ? 'rival gates.' : 'rival chains.'}</span>
      </h1>

      <p style={{
        maxWidth: 660, margin: '26px auto 0', fontSize: 19, lineHeight: 1.6, color: 'var(--marble-2)',
      }}>
        Ethereum and Solana supply and borrow the <em style={{ color: 'var(--marble)', fontStyle: 'normal', fontWeight: 500 }}>same liquidity</em> —
        one shared market, no bridge. Allies in yield. Rivals in the arena.
      </p>

      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 34, flexWrap: 'wrap' }}>
        <Button variant="gold" size="lg" onClick={onGate}>Choose your gate →</Button>
        <Button variant="outline" size="lg" href="#arena">Enter the arena</Button>
      </div>

      {/* Live one-pool ticker strip */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 0, marginTop: 48,
        border: '1px solid var(--stone-line-2)', borderRadius: 'var(--r-lg)',
        background: 'rgba(22,17,15,0.6)', backdropFilter: 'blur(8px)',
        overflow: 'hidden', flexWrap: 'wrap',
      }}>
        <TickerCell label="Total liquidity" value={<Counter value={POOL.totalSupplied / 1e6} prefix="$" suffix="M" decimals={1} />} />
        <TickerDiv />
        <TickerCell label="Suppliers" value={<Counter value={POOL.suppliers} />} />
        <TickerDiv />
        <TickerCell label="Net APR" value={<Counter value={POOL.netApr} suffix="%" decimals={2} />} accent />
        <TickerDiv />
        <TickerCell label="Live on" value={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><ChainGlyph chain="evm" size={15} /><ChainGlyph chain="sol" size={15} /></span>} />
      </div>

      <div style={{ marginTop: 30, display: 'flex', justifyContent: 'center' }}>
        <RomeLockup size={18} />
      </div>
    </Section>
  </header>
);

const TickerCell = ({ label, value, accent }) => (
  <div style={{ padding: '16px 26px', textAlign: 'left' }}>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--marble-3)', marginBottom: 6 }}>{label}</div>
    <div className="aer-num" style={{ fontSize: 22, fontWeight: 600, color: accent ? 'var(--gold)' : 'var(--marble)' }}>{value}</div>
  </div>
);
const TickerDiv = () => <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--stone-line)' }} />;

// ---------------------------------------------------------------------
// ONE SHARED POOL
// ---------------------------------------------------------------------
const SharedPool = () => (
  <Section id="pool" style={{ paddingTop: 96, paddingBottom: 96 }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 40 }}>
      <SectionHead
        eyebrow="One shared pool"
        title="Two chains. One book of liquidity."
        intro="Every deposit — from Ethereum or Solana — lands in the same market. Borrowers draw from the same reserves. This is not two pools bridged together; it is one pool with two front doors."
        titleSize={42}
      />

      <div style={{
        border: '1px solid var(--stone-line-2)', borderRadius: 'var(--r-lg)',
        background: 'linear-gradient(180deg, var(--basalt), var(--obsidian))',
        padding: 36, position: 'relative', overflow: 'hidden',
      }}>
        {/* top stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 34 }}>
          <BigStat label="Total supplied" value={<Counter value={POOL.totalSupplied / 1e6} prefix="$" suffix="M" decimals={2} />} sub={`${POOL.suppliers.toLocaleString()} suppliers`} />
          <BigStat label="Total borrowed" value={<Counter value={POOL.totalBorrowed / 1e6} prefix="$" suffix="M" decimals={2} />} sub={`${POOL.utilization}% utilization`} />
          <BigStat label="Net APR" value={<Counter value={POOL.netApr} suffix="%" decimals={2} />} sub={`${POOL.supplyApr}% supply · ${POOL.borrowApr}% borrow`} accent />
        </div>

        {/* the one-pool split bar */}
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="aer-eyebrow" style={{ color: 'var(--marble-3)' }}>Where the liquidity comes from</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)' }}>◆ One pool ◆</span>
        </div>
        <SplitBar evm={POOL.suppliedEvm} sol={POOL.suppliedSol} height={20} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 32 }}>
          <OriginCard chain="evm" supplied={POOL.suppliedEvm} borrowed={POOL.borrowedEvm} />
          <OriginCard chain="sol" supplied={POOL.suppliedSol} borrowed={POOL.borrowedSol} />
        </div>
      </div>
    </div>
  </Section>
);

const BigStat = ({ label, value, sub, accent }) => (
  <div>
    <div className="aer-eyebrow" style={{ color: 'var(--marble-3)', marginBottom: 12 }}>{label}</div>
    <div className="aer-num" style={{ fontSize: 'clamp(30px, 4vw, 44px)', fontWeight: 600, lineHeight: 1, color: accent ? 'var(--gold)' : 'var(--marble)' }}>{value}</div>
    {sub && <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--marble-3)' }}>{sub}</div>}
  </div>
);

const OriginCard = ({ chain, supplied, borrowed }) => {
  const c = CHAIN[chain];
  return (
    <div style={{
      border: `1px solid ${c.color}`, borderRadius: 'var(--r-md)',
      background: c.wash, padding: '20px 22px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <ChainBadge chain={chain} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--marble-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {chain === 'evm' ? 'The Ethereum Gate' : 'The Solana Gate'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--marble-3)', marginBottom: 6 }}>Supplied</div>
          <div className="aer-num" style={{ fontSize: 24, fontWeight: 600, color: c.bright }}>{fmtCompact(supplied)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--marble-3)', marginBottom: 6 }}>Borrowed</div>
          <div className="aer-num" style={{ fontSize: 24, fontWeight: 600, color: 'var(--marble-2)' }}>{fmtCompact(borrowed)}</div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Nav, Hero, SharedPool, Column });
