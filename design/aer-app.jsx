// =====================================================================
// AERARIUM — app assembly, connect modal, marble veins, tweaks
// =====================================================================

// Marble veining backdrop (feTurbulence) — subtle, behind everything
const MarbleVeins = () => (
  <svg className="aer-marble-veins" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <filter id="aer-marble" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.006" numOctaves="3" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix"
          values="0 0 0 0 0.55
                  0 0 0 0 0.16
                  0 0 0 0 0.56
                  0 0 0 0.6 0" />
      </filter>
    </defs>
    <rect width="100%" height="100%" filter="url(#aer-marble)" opacity="0.05" />
  </svg>
);

// ---------------------------------------------------------------------
// Connect modal — "Choose your gate" (the conversion moment)
// ---------------------------------------------------------------------
const ConnectModal = ({ open, onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(8,6,7,0.78)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      animation: 'aer-rise 200ms var(--ease)',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(720px, 100%)', border: '1px solid var(--stone-line-2)', borderRadius: 'var(--r-lg)',
        background: 'linear-gradient(180deg, var(--basalt-2), var(--obsidian))', overflow: 'hidden',
        boxShadow: '0 40px 120px -30px rgba(0,0,0,0.8)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 28px', borderBottom: '1px solid var(--stone-line)' }}>
          <div>
            <div className="aer-eyebrow" style={{ marginBottom: 6 }}>Choose your gate</div>
            <div className="aer-display" style={{ fontSize: 22, fontWeight: 400 }}>Enter the treasury</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'transparent', border: '1px solid var(--stone-line-2)', borderRadius: 'var(--r-sm)',
            color: 'var(--marble-2)', width: 34, height: 34, cursor: 'pointer', fontSize: 16,
          }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 28 }}>
          <ModalGate chain="evm" wallets={['MetaMask', 'Rabby', 'WalletConnect']} />
          <ModalGate chain="sol" wallets={['Phantom', 'Solflare', 'Backpack']} />
        </div>
        <div style={{ padding: '0 28px 24px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--marble-3)', letterSpacing: '0.04em' }}>
          Your gate decides your side in the arena. You can hold positions on both.
        </div>
      </div>
    </div>
  );
};

const ModalGate = ({ chain, wallets }) => {
  const [h, setH] = useState(false);
  const c = CHAIN[chain];
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      border: `1px solid ${h ? c.color : 'var(--stone-line-2)'}`, borderRadius: 'var(--r-md)',
      background: h ? c.wash : 'transparent', padding: '24px 22px', transition: 'all var(--dur)', cursor: 'pointer',
    }}>
      <ChainBadge chain={chain} />
      <h4 className="aer-display" style={{ fontSize: 20, fontWeight: 400, margin: '16px 0 14px' }}>
        {chain === 'evm' ? 'The Ethereum Gate' : 'The Solana Gate'}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {wallets.map((w) => (
          <div key={w} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '11px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--stone-line)',
            fontSize: 13.5, color: 'var(--marble)', background: 'var(--basalt)',
          }}>
            {w} <span style={{ color: c.bright }}>→</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// Tweaks — a few tasteful explore-later knobs
// ---------------------------------------------------------------------
const AerTweaks = ({ tweaks, setTweak }) => (
  <TweaksPanel title="Aerarium">
    <TweakSection title="Accent" />
    <TweakColor
      label="Imperial accent"
      value={tweaks.gold}
      options={['#C46AD0', '#7A1A7C', '#9A6BE0', '#C4566A']}
      onChange={(v) => setTweak('gold', v)}
    />
    <TweakSection title="Display face" />
    <TweakRadio
      label="Headlines"
      value={tweaks.face}
      options={[{ value: 'serif', label: 'Rome Serif' }, { value: 'cinzel', label: 'Inscriptional' }]}
      onChange={(v) => setTweak('face', v)}
    />
    <TweakSection title="Atmosphere" />
    <TweakToggle label="Marble veining" value={tweaks.veins} onChange={(v) => setTweak('veins', v)} />
    <TweakToggle label="Gold meanders" value={tweaks.meander} onChange={(v) => setTweak('meander', v)} />
    <TweakSection title="Hero headline" />
    <TweakRadio
      label="Variant"
      value={tweaks.hero}
      options={[{ value: 'rival', label: 'Two rival chains' }, { value: 'gates', label: 'Two gates' }]}
      onChange={(v) => setTweak('hero', v)}
    />
  </TweaksPanel>
);

// ---------------------------------------------------------------------
// App
// ---------------------------------------------------------------------
const App = () => {
  const [modal, setModal] = useState(false);
  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "gold": "#C46AD0",
    "face": "serif",
    "veins": true,
    "meander": true,
    "hero": "rival"
  }/*EDITMODE-END*/);

  // apply accent tweak to CSS vars
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--gold', tweaks.gold);
    root.style.setProperty('--gold-bright', tweaks.gold);
  }, [tweaks.gold]);

  // display face: Rome serif vs inscriptional Cinzel
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--font-display',
      tweaks.face === 'cinzel'
        ? "'Cinzel', 'Untitled Serif', Georgia, serif"
        : "'Untitled Serif', 'Cinzel', Georgia, serif");
  }, [tweaks.face]);

  useEffect(() => {
    document.body.classList.toggle('aer-no-meander', !tweaks.meander);
  }, [tweaks.meander]);

  const onConnect = useCallback(() => setModal(true), []);

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <div className="aer-marble-bg" />
      {tweaks.veins && <MarbleVeins />}

      <Nav onConnect={onConnect} />
      <Hero onGate={onConnect} heroVariant={tweaks.hero} />
      <SharedPool />
      <Arena />
      <Liquidations onConnect={onConnect} />
      <Gates onConnect={onConnect} />
      <Markets />
      <Footer />

      <ConnectModal open={modal} onClose={() => setModal(false)} />
      <AerTweaks tweaks={tweaks} setTweak={setTweak} />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
