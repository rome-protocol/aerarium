// =====================================================================
// AERARIUM — connected lane app (state machine + data + assembly)
// One parameterized <LaneApp chain="evm|sol" />. The Solana lane adds the
// first-time ACTIVATE step and multi-signature action progress.
// =====================================================================

// ---- per-lane mock data ---------------------------------------------
const LANE_DATA = {
  evm: {
    wallets: ['MetaMask', 'Rabby', 'WalletConnect'],
    address: '0x1234aB5cD6eF7890123456789abCdEf012345678',
    assets: [
      { sym: 'USDC', name: 'USD Coin', supplyApy: 5.18, borrowApy: 7.62, walletBal: 5000, suppliedBal: 0, borrowedBal: 0 },
      { sym: 'wETH', name: 'Wrapped Ether', supplyApy: 2.41, borrowApy: 0, walletBal: 3.2 * 3100, suppliedBal: 0, borrowedBal: 0, collateral: true },
      { sym: 'wBTC', name: 'Wrapped Bitcoin', supplyApy: 1.92, borrowApy: 0, walletBal: 0.4 * 64000, suppliedBal: 0, borrowedBal: 0, collateral: true },
    ],
    position: { supplied: 12400, borrowed: 4200, capacity: 8930, healthFactor: 2.12, netApr: 2.14,
      assets: [
        { sym: 'USDC', name: 'USD Coin', supplyApy: 5.18, borrowApy: 7.62, walletBal: 900, suppliedBal: 0, borrowedBal: 4200 },
        { sym: 'wETH', name: 'Wrapped Ether', supplyApy: 2.41, borrowApy: 0, walletBal: 0, suppliedBal: 9920, borrowedBal: 0, collateral: true },
        { sym: 'wBTC', name: 'Wrapped Bitcoin', supplyApy: 1.92, borrowApy: 0, walletBal: 0, suppliedBal: 2480, borrowedBal: 0, collateral: true },
      ] },
  },
  sol: {
    wallets: ['Phantom', 'Solflare', 'Backpack'],
    address: '7mxE2pYrNvKqGwLcHDfXhJtFB5d8aRz9C1bP3MnQgxrW',
    assets: [
      { sym: 'USDC', name: 'USD Coin', supplyApy: 5.18, borrowApy: 7.62, walletBal: 4200, suppliedBal: 0, borrowedBal: 0 },
      { sym: 'mSOL', name: 'Marinade SOL', supplyApy: 3.91, borrowApy: 0, walletBal: 60 * 168, suppliedBal: 0, borrowedBal: 0, collateral: true },
      { sym: 'JitoSOL', name: 'Jito Staked SOL', supplyApy: 3.74, borrowApy: 0, walletBal: 24 * 172, suppliedBal: 0, borrowedBal: 0, collateral: true },
      { sym: 'SOL', name: 'Solana', supplyApy: 3.28, borrowApy: 0, walletBal: 40 * 162, suppliedBal: 0, borrowedBal: 0, collateral: true },
    ],
    position: { supplied: 8600, borrowed: 3100, capacity: 6160, healthFactor: 1.84, netApr: 1.72,
      assets: [
        { sym: 'USDC', name: 'USD Coin', supplyApy: 5.18, borrowApy: 7.62, walletBal: 740, suppliedBal: 0, borrowedBal: 3100 },
        { sym: 'mSOL', name: 'Marinade SOL', supplyApy: 3.91, borrowApy: 0, walletBal: 0, suppliedBal: 5300, borrowedBal: 0, collateral: true },
        { sym: 'JitoSOL', name: 'Jito Staked SOL', supplyApy: 3.74, borrowApy: 0, walletBal: 0, suppliedBal: 3300, borrowedBal: 0, collateral: true },
      ] },
  },
};

const ACTIVITY_SAMPLE = [
  { id: 1, time: '2 min ago', verb: 'Supplied', amount: 5300, sym: 'mSOL' },
  { id: 2, time: '1 hr ago', verb: 'Borrowed', amount: 3100, sym: 'USDC' },
  { id: 3, time: 'Yesterday', verb: 'Supplied', amount: 3300, sym: 'JitoSOL' },
];

// ---- progress step recipes ------------------------------------------
const signSteps = (chain, action) => {
  if (chain === 'evm') {
    return [{ label: 'Sign in your wallet', tag: 'Sign' }, { label: `Confirming ${action} on Rome`, tag: 'Wait' }];
  }
  // Solana — multi-signature
  if (action === 'supply') return [
    { label: 'Approve token transfer (1 of 2)', tag: 'Sign' },
    { label: 'Supply to pool (2 of 2)', tag: 'Sign' },
    { label: 'Confirming on Rome', tag: 'Wait' },
  ];
  if (action === 'borrow') return [
    { label: 'Authorize borrow (1 of 2)', tag: 'Sign' },
    { label: 'Draw from pool (2 of 2)', tag: 'Sign' },
    { label: 'Confirming on Rome', tag: 'Wait' },
  ];
  return [{ label: `Sign ${action} (1 of 1)`, tag: 'Sign' }, { label: 'Confirming on Rome', tag: 'Wait' }];
};

const ACTIVATE_STEPS = [
  { label: 'Create your Aerarium account', tag: 'Sign' },
  { label: 'Initialize token accounts', tag: 'Sign' },
  { label: 'Register address lookup table', tag: 'Sign' },
];

// ---- Activate card (Solana first-time) ------------------------------
const ActivateCard = ({ activating, step, onActivate }) => (
  <div className="aer-card" style={{ padding: 40, maxWidth: 580, margin: '40px auto 0' }}>
    <div style={{ textAlign: 'center', marginBottom: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><ChainGlyph chain="sol" size={40} /></div>
      <span style={window.aerEyebrow}>One-time setup</span>
      <h2 className="aer-display" style={{ fontSize: 30, margin: '10px 0 0', fontWeight: 400 }}>Activate your Aerarium account</h2>
      <p style={{ margin: '14px auto 0', fontSize: 15.5, color: 'var(--marble-2)', maxWidth: 440, lineHeight: 1.6 }}>
        Solana needs a few accounts created on-chain before your first action. We’ll provision them in one short setup —
        <strong style={{ color: 'var(--marble)', fontWeight: 600 }}> you only do this once.</strong>
      </p>
    </div>

    {activating ? (
      <ProgressCard
        title="Setting up your account"
        note="Approve each signature in your wallet. This takes a few seconds and won’t cost gas on Rome."
        steps={ACTIVATE_STEPS}
        current={step}
      />
    ) : (
      <>
        <div style={{ border: '1px solid var(--stone-line)', borderRadius: 'var(--r-md)', overflow: 'hidden', marginBottom: 22 }}>
          {ACTIVATE_STEPS.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: i < ACTIVATE_STEPS.length - 1 ? '1px solid var(--stone-line)' : 'none' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--lane)', color: 'var(--lane)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontSize: 14.5, color: 'var(--marble)' }}>{s.label}</span>
            </div>
          ))}
        </div>
        <Button variant="gold" size="lg" full onClick={onActivate}>Activate — 3 signatures</Button>
        <p style={{ margin: '14px 0 0', textAlign: 'center', fontSize: 12.5, color: 'var(--marble-3)' }}>
          No Ethereum key needed · No gas on Rome · One-time only
        </p>
      </>
    )}
  </div>
);

// ---- error banner ---------------------------------------------------
const ErrorBanner = ({ message, onRetry }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 'var(--r-md)', background: 'var(--oxblood-wash)', border: '1px solid var(--oxblood-br)', marginBottom: 20 }}>
    <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--oxblood-br)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>!</span>
    <span style={{ flex: 1, fontSize: 14, color: 'var(--marble)' }}>{message}</span>
    <button onClick={onRetry} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--oxblood-br)', fontSize: 13.5, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>Try again</button>
  </div>
);

// =====================================================================
// LaneApp
// =====================================================================
const LaneApp = ({ chain }) => {
  const D = LANE_DATA[chain];
  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "screen": "live"
  }/*EDITMODE-END*/);

  // live interactive state
  const [conn, setConn] = useS(null);          // null | 'connecting' | wallet name (connected)
  const [activated, setActivated] = useS(chain !== 'sol'); // evm auto-activated
  const [activating, setActivating] = useS(false);
  const [actStep, setActStep] = useS(0);
  const [hasPos, setHasPos] = useS(false);
  const [sel, setSel] = useS(D.assets[0]);     // selected asset
  const [action, setAction] = useS('supply');
  const [amount, setAmount] = useS('');
  const [signing, setSigning] = useS(false);
  const [signStep, setSignStep] = useS(0);
  const [error, setError] = useS(null);
  const [activity, setActivity] = useS(chain === 'sol' ? [] : []);

  // tweaks "screen" overrides the live machine for design review
  const forced = tweaks.screen;
  const data = (hasPos || forced === 'position') ? D.position : { supplied: 0, borrowed: 0, capacity: 0, healthFactor: 0, netApr: 0, assets: D.assets };
  const assets = data.assets || D.assets;
  const acct = { address: D.address, wallet: chain === 'sol' ? 'Phantom' : 'MetaMask' };

  // derive the effective screen
  let screen = forced;
  if (forced === 'live') {
    if (!conn) screen = 'disconnected';
    else if (conn === 'connecting') screen = 'connecting';
    else if (chain === 'sol' && !activated) screen = activating ? 'activating' : 'activate';
    else if (error) screen = 'error';
    else if (signing) screen = 'signing';
    else screen = hasPos ? 'position' : 'empty';
  }
  const showActivity = (forced === 'position' || (forced === 'live' && hasPos)) ? ACTIVITY_SAMPLE : [];

  // ---- live transitions ----
  const connect = (w) => { setConn('connecting'); setTimeout(() => setConn(w), 1100); };
  const activate = () => {
    setActivating(true); setActStep(0);
    let s = 0; const t = setInterval(() => { s++; setActStep(s); if (s >= ACTIVATE_STEPS.length) { clearInterval(t); setTimeout(() => { setActivating(false); setActivated(true); }, 600); } }, 950);
  };
  const submit = () => {
    setError(null); setSigning(true); setSignStep(0);
    const steps = signSteps(chain, action);
    let s = 0; const t = setInterval(() => { s++; setSignStep(s); if (s >= steps.length) { clearInterval(t); setTimeout(() => { setSigning(false); setHasPos(true); setAmount(''); setActivity(ACTIVITY_SAMPLE); }, 600); } }, 950);
  };
  const openAction = (type, a) => { setSel(a); setAction(type); setAmount(''); };

  // projected rows for action panel
  const projected = (() => {
    const amt = parseFloat(amount || '0') || 0;
    const apr = action === 'borrow' || action === 'repay' ? sel.borrowApy : sel.supplyApy;
    const rows = [{ k: action === 'borrow' || action === 'repay' ? 'Borrow APY' : 'Supply APY', v: (apr || 0).toFixed(2) + '%', tone: action === 'supply' ? 'var(--pos)' : 'var(--marble)' }];
    if (action === 'supply') rows.push({ k: 'Projected earnings', v: '~' + fmt$(amt * (apr / 100)) + '/yr', tone: 'var(--gold-bright)' });
    if (action === 'borrow') rows.push({ k: 'New health factor', v: (data.healthFactor ? Math.max(1.05, data.healthFactor - amt / 8000).toFixed(2) : '—'), tone: 'var(--gold-bright)' });
    rows.push({ k: 'Lane', v: CHAIN[chain].label });
    return rows;
  })();
  const selWithMax = { ...sel, max: action === 'supply' ? sel.walletBal : action === 'withdraw' ? sel.suppliedBal : action === 'repay' ? sel.borrowedBal : (data.capacity - data.borrowed) };

  return (
    <div>
      <div className="aer-light-bg" />
      <LaneHeader chain={chain} account={screen === 'disconnected' || screen === 'connecting' ? null : acct} onDisconnect={() => { setConn(null); setHasPos(false); setActivated(chain !== 'sol'); setTweak('screen', 'live'); }} />

      <div className="aer-app" style={{ paddingTop: 32 }}>
        {screen === 'disconnected' || screen === 'connecting' ? (
          <ConnectCard chain={chain} wallets={D.wallets} connecting={screen === 'connecting' ? (conn === 'connecting' ? D.wallets[0] : conn) : null} onConnect={connect} />
        ) : screen === 'activate' || screen === 'activating' ? (
          <ActivateCard activating={screen === 'activating'} step={actStep} onActivate={activate} />
        ) : (
          <>
            {screen === 'empty' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderRadius: 'var(--r-md)', background: 'var(--lane-wash)', border: '1px solid var(--lane)', marginBottom: 22 }}>
                <ChainGlyph chain={chain} size={18} />
                <span style={{ fontSize: 14.5, color: 'var(--marble)' }}><strong style={{ fontWeight: 600 }}>No position yet.</strong> Supply an asset to start earning and unlock borrowing.</span>
              </div>
            )}
            <div className="aer-app-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <PositionSummary {...data} empty={screen === 'empty'} />
                <AssetTable title="Assets" assets={assets} onAction={openAction} activeSym={sel.sym} />
              </div>
              <div className="aer-rail">
                {screen === 'error' && <ErrorBanner message={chain === 'sol' ? 'A signature was rejected in your wallet.' : 'Transaction rejected in your wallet.'} onRetry={() => { setError(null); setTweak('screen', 'live'); }} />}
                {screen === 'signing'
                  ? <ProgressCard
                      title={`${ACTIONS[action]}ing ${sel.sym}`}
                      note={chain === 'sol' ? 'This action needs two signatures — approve each pop-up in Phantom.' : 'Approve in your wallet, then we confirm on Rome.'}
                      steps={signSteps(chain, action)} current={forced === 'signing' ? 1 : signStep}
                      onCancel={() => { setSigning(false); setTweak('screen', 'live'); }} />
                  : <ActionPanel
                      asset={selWithMax} action={action} amount={amount}
                      onAmount={setAmount} onActionType={setAction} onAction={submit}
                      projected={projected}
                      submitLabel={`${ACTIONS[action]} ${amount || '0.00'} ${sel.sym}`} />}
                <ActivityFeed items={showActivity} />
              </div>
            </div>
          </>
        )}
      </div>

      <LaneTweaks chain={chain} screen={forced} setTweak={setTweak} />
    </div>
  );
};

// ---- tweaks: jump to any state for review ---------------------------
const LaneTweaks = ({ chain, screen, setTweak }) => {
  const opts = [
    { value: 'live', label: 'Live (interactive)' },
    { value: 'disconnected', label: 'Disconnected' },
    { value: 'connecting', label: 'Connecting' },
    ...(chain === 'sol' ? [{ value: 'activate', label: 'Activate (first-time)' }, { value: 'activating', label: 'Activating…' }] : []),
    { value: 'empty', label: 'Connected · empty' },
    { value: 'position', label: 'Connected · position' },
    { value: 'signing', label: 'Action signing' },
    { value: 'error', label: 'Error' },
  ];
  return (
    <TweaksPanel title={`${CHAIN[chain].label} lane`}>
      <TweakSection title="Screen state" />
      <TweakSelect value={screen} onChange={(v) => setTweak('screen', v)} options={opts} />
      <TweakSection title="The other lane" />
      <div style={{ padding: '2px 2px 6px' }}>
        <a href={chain === 'evm' ? 'Aerarium — Solana Lane.html' : 'Aerarium — Ethereum Lane.html'}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--marble-2)', textDecoration: 'none' }}>
          → Open the {chain === 'evm' ? 'Solana' : 'Ethereum'} lane
        </a>
      </div>
    </TweaksPanel>
  );
};

Object.assign(window, { LaneApp, ActivateCard, ErrorBanner, LANE_DATA });
