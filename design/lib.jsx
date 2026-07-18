// =====================================================================
// Compound on Rome — shared primitives, formatters, mock data
// =====================================================================
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---------- Formatters ----------
const fmtUSD = (n) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtUSDC = (n, dp = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const fmtPct = (n) => n.toFixed(2) + '%';
const shortAddr = (a) => a.length > 12 ? a.slice(0, 4) + '…' + a.slice(-4) : a;
const relTime = (ts) => {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return Math.floor(s) + ' sec ago';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
  return Math.floor(s / 86400) + ' days ago';
};

// ---------- Pool stats (mock) ----------
const POOL_STATS = {
  tvl: 4_287_531,
  supplyApy: 5.20,
  borrowApy: 7.84,
  utilization: 62,
};

// ---------- Roman numeral component ----------
const RN = ({ n, size = 14, color = 'var(--rome-purple)' }) => (
  <span style={{
    fontFamily: 'var(--font-serif)', fontStyle: 'italic',
    fontSize: size, lineHeight: 1, color, fontVariantNumeric: 'oldstyle-nums',
    letterSpacing: '0.02em',
  }}>{n}.</span>
);

// ---------- Eyebrow ----------
const Eyebrow = ({ children, color = 'var(--fg2)', style }) => (
  <span style={{
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em',
    textTransform: 'uppercase', color, fontWeight: 400, ...style,
  }}>{children}</span>
);

// ---------- Hairline ----------
const Hairline = ({ color = 'var(--border-subtle)', style }) => (
  <div style={{ height: 1, background: color, width: '100%', ...style }} />
);

// ---------- Button ----------
const Button = ({ variant = 'primary', children, onClick, disabled, fullWidth, size = 'md', style, type = 'button' }) => {
  const [hover, setHover] = useState(false);
  const sizes = {
    sm: { padding: '8px 16px', fontSize: 13 },
    md: { padding: '13px 22px', fontSize: 14 },
    lg: { padding: '16px 28px', fontSize: 15 },
  };
  const variants = {
    primary: {
      background: disabled ? 'var(--rome-stone-100)' : (hover ? 'var(--rome-purple-hover)' : 'var(--rome-purple)'),
      color: disabled ? 'var(--rome-stone-400)' : 'var(--fg-inverse)',
      borderColor: 'transparent',
    },
    secondary: {
      background: hover && !disabled ? 'var(--rome-ink)' : 'transparent',
      color: hover && !disabled ? 'var(--fg-inverse)' : 'var(--rome-ink)',
      borderColor: 'var(--rome-ink)',
    },
    ghost: {
      background: hover && !disabled ? 'rgba(20,2,24,0.04)' : 'transparent',
      color: 'var(--rome-ink)',
      borderColor: 'var(--border-default)',
    },
    link: {
      background: 'transparent',
      color: hover ? 'var(--rome-purple-hover)' : 'var(--rome-purple)',
      borderColor: 'transparent',
      padding: 0,
      textDecoration: hover ? 'underline' : 'none',
      textUnderlineOffset: 3,
    },
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        borderRadius: 999,
        border: '1px solid',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transition: 'all 180ms cubic-bezier(.2,.8,.2,1)',
        width: fullWidth ? '100%' : 'auto',
        letterSpacing: '0.005em',
        ...sizes[size],
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
};

// ---------- Card ----------
const Card = ({ children, style, padding = 28 }) => (
  <div style={{
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 12,
    padding,
    ...style,
  }}>{children}</div>
);

// ---------- Amount input (USDC) ----------
const AmountInput = ({ value, onChange, max, maxLabel, suffix = 'USDC', autoFocus, disabled }) => {
  const inputRef = useRef(null);
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      border: '1px solid var(--border-default)',
      borderRadius: 10,
      background: 'var(--bg-surface)',
      padding: '14px 16px',
      gap: 12,
      transition: 'border-color 160ms',
      opacity: disabled ? 0.6 : 1,
    }}
      onFocus={(e) => e.currentTarget.style.borderColor = 'var(--rome-purple)'}
      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-default)'}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, '');
          onChange(v);
        }}
        placeholder="0.00"
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontFamily: 'var(--font-serif)',
          fontSize: 28,
          fontWeight: 400,
          color: 'var(--fg1)',
          letterSpacing: '-0.01em',
          minWidth: 0,
        }}
      />
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--fg2)',
      }}>{suffix}</span>
      {max !== undefined && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(String(max))}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            border: '1px solid var(--border-default)',
            background: 'transparent',
            padding: '6px 10px',
            borderRadius: 999,
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: 'var(--rome-ink)',
          }}
        >{maxLabel || 'Max'}</button>
      )}
    </div>
  );
};

// ---------- Stat block (big number / small label) ----------
const Stat = ({ label, value, hint, loading }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em',
      textTransform: 'uppercase', color: 'var(--fg2)',
    }}>{label}</div>
    <div style={{
      fontFamily: 'var(--font-serif)', fontSize: 36, lineHeight: 1.05,
      letterSpacing: '-0.02em', color: 'var(--fg1)', fontWeight: 400,
      minHeight: 38,
    }}>
      {loading ? <span style={{ color: 'var(--fg3)' }}>—</span> : value}
    </div>
    {hint && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--fg2)' }}>{hint}</div>}
  </div>
);

// ---------- Spinner ----------
const Spinner = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'rome-spin 1s linear infinite' }}>
    <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.5" fill="none" opacity="0.2" />
    <path d="M12 3 a9 9 0 0 1 9 9" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
  </svg>
);

// ---------- Three-step progress dots ●─●─○ ----------
// Used by the Solana lane to show phase 1 → user-sign → phase 2 progress.
const ProgressDots = ({ step, total = 3 }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
    {Array.from({ length: total }).map((_, i) => {
      const filled = i <= step;
      const isLast = i === total - 1;
      return (
        <React.Fragment key={i}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: filled ? 'var(--rome-purple)' : 'transparent',
            border: filled ? 'none' : '1px solid var(--border-default)',
            transition: 'background 200ms',
            flexShrink: 0,
          }} />
          {!isLast && (
            <span style={{
              width: 28, height: 1,
              background: i < step ? 'var(--rome-purple)' : 'var(--border-default)',
              transition: 'background 200ms',
            }} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ---------- Tx hash row (Solana lane phase tables) ----------
// Renders one labelled row in the per-state "what happened" table.
// Variants: pending (italic dim text + spinner), done (mono hash + view link),
//           idle (dim em-dash placeholder).
const TxRow = ({ label, hash, txUrl, status = 'idle', explorer = 'view →' }) => (
  <div style={{
    display: 'grid', gridTemplateColumns: '140px 1fr auto',
    gap: 16, alignItems: 'baseline',
    padding: '10px 0',
    borderBottom: '1px solid var(--border-subtle)',
  }}>
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: 'var(--fg2)',
    }}>{label}</span>
    {status === 'pending' && (
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg2)',
        fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: 8,
      }}>
        <Spinner size={11} />pending…
      </span>
    )}
    {status === 'idle' && (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg3)' }}>—</span>
    )}
    {status === 'done' && (
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg1)',
        letterSpacing: '0.02em',
      }}>{hash}</span>
    )}
    {status === 'done' && txUrl ? (
      <TxLink href={txUrl}>{explorer}</TxLink>
    ) : <span />}
  </div>
);
const StepIcon = ({ status }) => {
  if (status === 'done') return (
    <span style={{
      width: 22, height: 22, borderRadius: '50%', background: 'var(--rome-purple)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6.2 L4.8 8.5 L9.5 3.5" stroke="#FBF8F4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
  if (status === 'active') return (
    <span style={{
      width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--rome-purple)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      color: 'var(--rome-purple)',
    }}>
      <Spinner size={11} />
    </span>
  );
  return (
    <span style={{
      width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--border-default)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      color: 'var(--fg3)', fontFamily: 'var(--font-serif)', fontSize: 11,
    }}>·</span>
  );
};

// ---------- Toast ----------
const Toast = ({ message, txUrl, onDismiss }) => {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);
  if (!message) return null;
  return (
    <div style={{
      position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--rome-ink)', color: 'var(--fg-inverse)',
      padding: '14px 20px', borderRadius: 999, zIndex: 100,
      display: 'flex', alignItems: 'center', gap: 14,
      fontFamily: 'var(--font-sans)', fontSize: 14,
      boxShadow: 'var(--shadow-md)',
    }}>
      <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6.2 L4.8 8.5 L9.5 3.5" stroke="#FBF8F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{message}</span>
      {txUrl && (
        <a href={txUrl} target="_blank" rel="noreferrer" style={{
          color: 'var(--rome-cream)', textDecoration: 'underline', textUnderlineOffset: 3,
          fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.06em',
        }}>view tx →</a>
      )}
    </div>
  );
};

// ---------- Inline error ----------
const InlineError = ({ message, onRetry }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12, marginTop: 14,
    padding: '12px 14px', borderRadius: 8,
    background: 'rgba(94,10,96,0.04)', border: '1px solid rgba(94,10,96,0.18)',
  }}>
    <span style={{
      width: 18, height: 18, borderRadius: '50%', background: 'var(--rome-purple)',
      color: 'var(--fg-inverse)', display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
    }}>!</span>
    <span style={{ flex: 1, fontSize: 14, color: 'var(--rome-ink)' }}>{message}</span>
    {onRetry && (
      <button onClick={onRetry} style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--rome-purple)', fontFamily: 'var(--font-sans)', fontSize: 13,
        textDecoration: 'underline', textUnderlineOffset: 3, padding: 0,
      }}>Try again</button>
    )}
  </div>
);

// ---------- Tx-link inline ----------
const TxLink = ({ href, children = 'view tx →' }) => (
  <a href={href} target="_blank" rel="noreferrer" style={{
    fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.04em',
    color: 'var(--rome-purple)', textDecoration: 'underline', textUnderlineOffset: 3,
  }}>{children}</a>
);

// ---------- Address chip ----------
const AddressChip = ({ address, onDisconnect }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 14px 6px 10px',
        border: '1px solid var(--border-default)',
        borderRadius: 999,
        background: 'var(--bg-surface)',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#3FA66B',
        }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 13,
          letterSpacing: '0.02em', color: 'var(--fg1)',
          cursor: 'pointer',
        }}
          onClick={() => {
            navigator.clipboard?.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          title="Click to copy"
        >
          {copied ? 'copied' : shortAddr(address)}
        </span>
      </div>
      <button onClick={onDisconnect} style={{
        background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
        fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg2)',
        textDecoration: 'underline', textUnderlineOffset: 3,
      }}>Disconnect</button>
    </div>
  );
};

// =====================================================================
// Export to window
// =====================================================================
Object.assign(window, {
  fmtUSD, fmtUSDC, fmtPct, shortAddr, relTime,
  POOL_STATS,
  RN, Eyebrow, Hairline, Button, Card, AmountInput, Stat, Spinner, StepIcon,
  Toast, InlineError, TxLink, AddressChip,
  ProgressDots, TxRow,
});
