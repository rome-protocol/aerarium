// =====================================================================
// AERARIUM — Reusable Section Template
// A documented scaffold in the brand language. Clone <TemplateSection>
// and swap the slots. Demonstrated below with two filled examples.
// =====================================================================

// ---------------------------------------------------------------------
// The template. Every Aerarium section is built from these slots:
//   eyebrow  → mono gold kicker
//   title    → Cinzel display
//   intro    → sans body
//   children → the section body (panels, grids, cards)
//   cta      → optional action row
// Set `tone="evm" | "sol"` to chain-tint a section.
// ---------------------------------------------------------------------
const TemplateSection = ({ id, eyebrow, title, intro, align = 'left', tone, ornament, children, cta }) => {
  const accent = tone === 'evm' ? 'var(--evm)' : tone === 'sol' ? 'var(--sol)' : 'var(--gold)';
  return (
    <Section id={id} style={{ paddingTop: 88, paddingBottom: 88 }}>
      {ornament && <div style={{ display: 'flex', justifyContent: align === 'center' ? 'center' : 'flex-start', marginBottom: 18 }}><Meander w={140} color={accent} /></div>}
      <div style={{ textAlign: align, maxWidth: align === 'center' ? 720 : 780, margin: align === 'center' ? '0 auto' : 0 }}>
        {eyebrow && <div className="aer-eyebrow" style={{ marginBottom: 16, color: accent }}>{eyebrow}</div>}
        <h2 className="aer-display" style={{ fontSize: 'clamp(32px, 4.4vw, 46px)', margin: 0, fontWeight: 400 }}>{title}</h2>
        {intro && <p style={{ marginTop: 16, fontSize: 17, color: 'var(--marble-2)', lineHeight: 1.6 }}>{intro}</p>}
      </div>
      {children && <div style={{ marginTop: 40 }}>{children}</div>}
      {cta && <div style={{ marginTop: 36, display: 'flex', gap: 14, justifyContent: align === 'center' ? 'center' : 'flex-start', flexWrap: 'wrap' }}>{cta}</div>}
    </Section>
  );
};

// Reusable sub-parts ---------------------------------------------------
const Panel = ({ children, style }) => (
  <div style={{ border: '1px solid var(--stone-line-2)', borderRadius: 'var(--r-lg)', background: 'linear-gradient(180deg, var(--basalt), var(--obsidian))', padding: 28, ...style }}>{children}</div>
);

const StepCard = ({ n, tone, title, body }) => {
  const accent = tone === 'evm' ? 'var(--evm)' : tone === 'sol' ? 'var(--sol)' : 'var(--gold)';
  return (
    <Panel>
      <div style={{
        width: 40, height: 40, borderRadius: '50%', border: `1px solid ${accent}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
        fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: accent,
      }}>{n}</div>
      <h3 className="aer-display" style={{ fontSize: 20, fontWeight: 400, margin: '0 0 10px' }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--marble-2)', lineHeight: 1.6 }}>{body}</p>
    </Panel>
  );
};

const FeatureRow = ({ tone, k, title, body }) => {
  const accent = tone === 'evm' ? 'var(--evm)' : tone === 'sol' ? 'var(--sol)' : 'var(--gold)';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 28, padding: '24px 0', borderBottom: '1px solid var(--stone-line)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent }}>{k}</div>
      <div>
        <h3 className="aer-display" style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>{title}</h3>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--marble-2)', lineHeight: 1.6, maxWidth: 620 }}>{body}</p>
      </div>
    </div>
  );
};

const Anatomy = () => (
  <div style={{ border: '1px dashed var(--stone-line-2)', borderRadius: 'var(--r-lg)', padding: 28, background: 'var(--gold-wash)' }}>
    <div className="aer-eyebrow" style={{ marginBottom: 16 }}>Anatomy of a section</div>
    <pre style={{
      margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.8, color: 'var(--marble-2)',
      whiteSpace: 'pre-wrap', overflowX: 'auto',
    }}>{`<TemplateSection
  eyebrow="Section kicker"      // mono · gold (or chain-tinted)
  title="Cinzel display title"  // the headline
  intro="One-line sans intro."  // optional body lede
  align="left | center"
  tone="evm | sol | (gold)"     // chain accent
  ornament                      // gold meander divider
  cta={<Button>Action →</Button>}
>
  {/* body: <Panel>, grids, <StepCard>, <FeatureRow>, SplitBar… */}
</TemplateSection>`}</pre>
  </div>
);

// ---------------------------------------------------------------------
// Page — anatomy + two filled examples
// ---------------------------------------------------------------------
const App = () => (
  <div style={{ position: 'relative', minHeight: '100vh' }}>
    <div className="aer-marble-bg" />

    <Section style={{ paddingTop: 64, paddingBottom: 8 }}>
      <div className="aer-eyebrow" style={{ marginBottom: 18 }}>Section Template</div>
      <h1 className="aer-display" style={{ fontSize: 'clamp(40px, 6vw, 64px)', margin: 0, fontWeight: 400 }}>One language, any section.</h1>
      <p style={{ marginTop: 18, fontSize: 18, color: 'var(--marble-2)', maxWidth: 640, lineHeight: 1.6 }}>
        A single scaffold powers every page. Swap the slots; the rhythm, type and accents stay consistent.
      </p>
      <div style={{ marginTop: 32 }}><Anatomy /></div>
    </Section>

    {/* Example 1 — "How it works" steps (centered, gold) */}
    <TemplateSection
      eyebrow="Example · How it works"
      title="Three steps into the treasury"
      intro="A neutral, centered section using step cards."
      align="center"
      ornament
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        <StepCard n="I" tone="evm" title="Choose your gate" body="Connect from Ethereum or Solana. Your wallet is your side." />
        <StepCard n="II" title="Supply or borrow" body="Your liquidity joins one shared pool — no bridge, no wrapped IOUs." />
        <StepCard n="III" tone="sol" title="Enter the arena" body="Earn yield, or hunt underwater positions across both chains." />
      </div>
    </TemplateSection>

    {/* Example 2 — chain-tinted feature list (left, violet) */}
    <TemplateSection
      eyebrow="Example · The Solana gate"
      title="Built for the violet side"
      intro="A left-aligned, chain-tinted section using feature rows and a CTA."
      tone="sol"
      cta={<>
        <Button variant="chain" chain="sol">Enter the Solana gate →</Button>
        <Button variant="ghost">Read the docs</Button>
      </>}
    >
      <div>
        <FeatureRow tone="sol" k="Native" title="Phantom, Solflare, Backpack" body="Connect with the wallet you already use. No new seed phrase, no custodial bridge." />
        <FeatureRow tone="sol" k="Shared" title="The same pool as Ethereum" body="Your SOL-side deposits earn from the same borrowers an Ethereum supplier funds." />
        <FeatureRow tone="sol" k="Competitive" title="Carry the violet into the arena" body="Every liquidation you win counts toward Solana’s monthly standing." />
      </div>
    </TemplateSection>

    <Footer />
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
