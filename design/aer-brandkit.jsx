// =====================================================================
// AERARIUM — Brand Kit
// Logo, palette, type, and core components on one page.
// =====================================================================

const Swatch = ({ name, varName, hex, ink }) => (
  <div style={{ borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--stone-line)' }}>
    <div style={{ height: 86, background: `var(${varName})` }} />
    <div style={{ padding: '12px 14px', background: 'var(--basalt)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--marble)' }}>{name}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--marble-3)', marginTop: 3 }}>{hex}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--marble-4)', marginTop: 2 }}>{varName}</div>
    </div>
  </div>
);

const KitBlock = ({ title, note, children }) => (
  <div style={{ marginBottom: 64 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
      <h2 className="aer-display" style={{ fontSize: 26, fontWeight: 400, margin: 0 }}>{title}</h2>
      <div style={{ flex: 1, height: 1, background: 'var(--stone-line)' }} />
    </div>
    {note && <p style={{ margin: '0 0 24px', fontSize: 14.5, color: 'var(--marble-2)', maxWidth: 680 }}>{note}</p>}
    {children}
  </div>
);

const Grid = ({ cols = 4, gap = 16, children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}>{children}</div>
);

const Panel = ({ children, pad = 28, style }) => (
  <div style={{ border: '1px solid var(--stone-line-2)', borderRadius: 'var(--r-lg)', background: 'linear-gradient(180deg, var(--basalt), var(--obsidian))', padding: pad, ...style }}>{children}</div>
);

const TypeRow = ({ label, font, children, style }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 24, padding: '16px 0', borderBottom: '1px solid var(--stone-line)' }}>
    <div style={{ width: 130, flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--marble-3)' }}>{label}</div>
    <div style={{ fontFamily: font, ...style }}>{children}</div>
  </div>
);

const App = () => (
  <div style={{ position: 'relative', minHeight: '100vh' }}>
    <div className="aer-marble-bg" />

    <Section style={{ paddingTop: 64, paddingBottom: 48 }}>
      <div className="aer-eyebrow" style={{ marginBottom: 18 }}>Brand Kit · v1</div>
      <h1 className="aer-display" style={{ fontSize: 'clamp(40px, 6vw, 72px)', margin: 0, fontWeight: 400 }}>The Aerarium system</h1>
      <p style={{ marginTop: 18, fontSize: 18, color: 'var(--marble-2)', maxWidth: 640, lineHeight: 1.6 }}>
        A Rome-branded visual language for a cross-VM money market. Rome purple and cream on dark plum;
        steel-blue and violet for the two rival gates. Built on the Rome type system — Untitled Serif, Untitled Sans, IBM Plex Mono.
      </p>
      <div style={{ marginTop: 22 }}><RomeLockup size={22} /></div>
    </Section>

    <Section style={{ paddingBottom: 80 }}>
      {/* LOGO */}
      <KitBlock title="The mark" note="The logomark is an “A” built as a temple front: a Rome-purple pediment over two columns — steel-blue (the Ethereum gate) and violet (the Solana gate) — joined by a purple architrave, the shared pool. Two gates, one treasury, on Rome.">
        <Grid cols={3}>
          <Panel style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <Logomark size={120} />
          </Panel>
          <Panel style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <Wordmark size={30} />
          </Panel>
          <Panel style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, background: 'var(--marble)' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 30, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--obsidian)' }}>Aerarium</span>
          </Panel>
        </Grid>
      </KitBlock>

      {/* COLOR */}
      <KitBlock title="Palette" note="Rome's dark plum base with cream text. Rome purple is the single primary accent; oxblood for danger. The dual-chain accents are reserved strictly for chain identity — steel-blue = Ethereum, violet = Solana.">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--marble-3)', margin: '0 0 14px' }}>Rome neutrals & cream</div>
        <Grid cols={5} >
          <Swatch name="Dark plum" varName="--obsidian" hex="#140218" />
          <Swatch name="Plum surface" varName="--basalt-2" hex="#25102B" />
          <Swatch name="Hairline" varName="--stone-line-2" hex="rgba(251,248,244,.18)" />
          <Swatch name="Cream" varName="--marble" hex="#FBF8F4" />
          <Swatch name="Stone" varName="--marble-2" hex="#C5B6C7" />
        </Grid>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--marble-3)', margin: '28px 0 14px' }}>Rome purple, oxblood & dual-chain</div>
        <Grid cols={5}>
          <Swatch name="Rome purple" varName="--rome-purple" hex="#5E0A60" />
          <Swatch name="Purple bright" varName="--gold" hex="#C46AD0" />
          <Swatch name="Oxblood" varName="--oxblood-br" hex="#C4566A" />
          <Swatch name="Ethereum steel" varName="--evm" hex="#5E8FBF" />
          <Swatch name="Solana violet" varName="--sol" hex="#9A6BE0" />
        </Grid>
      </KitBlock>

      {/* TYPE */}
      <KitBlock title="Typography" note="Untitled Serif (Rome's editorial display) for headlines and the wordmark. Untitled Sans for body. IBM Plex Mono for all numbers, rates, addresses and labels.">
        <Panel>
          <TypeRow label="Display · Untitled Serif" font="var(--font-display)" style={{ fontSize: 46, fontWeight: 400, color: 'var(--marble)' }}>One pool. Two rival chains.</TypeRow>
          <TypeRow label="Heading · Untitled Serif" font="var(--font-display)" style={{ fontSize: 28, fontWeight: 500, color: 'var(--marble)' }}>Who is liquidating whom?</TypeRow>
          <TypeRow label="Body · Untitled Sans" font="var(--font-sans)" style={{ fontSize: 17, color: 'var(--marble-2)', lineHeight: 1.6 }}>Ethereum and Solana supply and borrow the same liquidity — one shared market, no bridge.</TypeRow>
          <TypeRow label="Data · IBM Plex Mono" font="var(--font-mono)" style={{ fontSize: 22, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>$48.21M · 3.94% · 0x4F2a…9bC1</TypeRow>
          <TypeRow label="Eyebrow · Mono" font="var(--font-mono)" style={{ fontSize: 12, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--gold)' }}>The Arena · Last 30 days</TypeRow>
        </Panel>
      </KitBlock>

      {/* COMPONENTS */}
      <KitBlock title="Core components" note="The reusable parts. All respond to the imperial accent token, so a single change re-skins the system.">
        <Grid cols={2} gap={20}>
          <Panel>
            <Label>Buttons</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <Button variant="gold">Connect</Button>
              <Button variant="outline">Enter the arena</Button>
              <Button variant="chain" chain="evm">Ethereum gate</Button>
              <Button variant="chain" chain="sol">Solana gate</Button>
              <Button variant="ghost">Learn more</Button>
            </div>
          </Panel>
          <Panel>
            <Label>Chain identity</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
              <ChainBadge chain="evm" />
              <ChainBadge chain="sol" />
              <NetPill>Rome · Testnet</NetPill>
              <ChainGlyph chain="evm" size={26} />
              <ChainGlyph chain="sol" size={26} />
            </div>
          </Panel>
          <Panel>
            <Label>One-pool split bar</Label>
            <SplitBar evm={62} sol={38} height={18} />
          </Panel>
          <Panel>
            <Label>Ornament</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, height: 44 }}>
              <Meander w={160} />
              <Crown />
            </div>
          </Panel>
        </Grid>
      </KitBlock>

      {/* VOICE */}
      <KitBlock title="Voice" note="Roman, confident, a touch combative. Plain about the mechanism; theatrical about the rivalry.">
        <Grid cols={3} gap={16}>
          <VoiceCard do="Say" lines={['“One pool. Two rival chains.”', '“Your gate decides your side.”', '“Underwater. Unclaimed. Yours to take.”']} good />
          <VoiceCard do="Avoid" lines={['“Awesome! ✨ Funds earning yield!”', '“Synergistic cross-chain rails”', 'Emoji, hype, jargon']} />
          <VoiceCard do="Principle" lines={['Numbers are the headline.', 'Mechanism is visible, not hidden.', 'Marble, not chrome.']} />
        </Grid>
      </KitBlock>
    </Section>

    <Footer />
  </div>
);

const Label = ({ children }) => (
  <div className="aer-eyebrow" style={{ color: 'var(--marble-3)', marginBottom: 18 }}>{children}</div>
);

const VoiceCard = ({ do: label, lines, good }) => (
  <div style={{ border: `1px solid ${good ? 'var(--gold)' : 'var(--stone-line-2)'}`, borderRadius: 'var(--r-md)', background: good ? 'var(--gold-wash)' : 'var(--basalt)', padding: 22 }}>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: good ? 'var(--gold)' : 'var(--marble-3)', marginBottom: 14 }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {lines.map((l, i) => <span key={i} style={{ fontSize: 14, color: 'var(--marble-2)', lineHeight: 1.5 }}>{l}</span>)}
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
