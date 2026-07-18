"use client";
// =====================================================================
// AERARIUM landing — brand primitives
// Ported from design/aer-brand.jsx → typed TSX. Logomark (temple-front
// "A"), wordmark, buttons, chain badges, split bar, animated counters,
// section scaffolding, gold meander, Rome co-brand lockup.
// =====================================================================
import {
  useState,
  useEffect,
  useRef,
  useId,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import { CHAIN, type Side } from "./tokens";

// ---------------------------------------------------------------------
// Logomark — an "A" built as a temple front.
// ---------------------------------------------------------------------
export const Logomark = ({ size = 40, title = "Aerarium" }: { size?: number; title?: string }) => {
  // useId() is SSR-safe (stable server↔client) so the gradient ids + their
  // url(#…) refs match across hydration. The designer's prototype used
  // Math.random(), which is client-only and mismatches under SSR. Colons are
  // stripped so the value is safe inside url(#…).
  const id = "lm" + useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" role="img" aria-label={title}
      style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id={id + "g"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold-bright)" />
          <stop offset="1" stopColor="var(--gold-deep)" />
        </linearGradient>
        <linearGradient id={id + "e"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--evm-bright)" />
          <stop offset="1" stopColor="var(--evm-deep)" />
        </linearGradient>
        <linearGradient id={id + "s"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sol-bright)" />
          <stop offset="1" stopColor="var(--sol-deep)" />
        </linearGradient>
      </defs>
      <path d="M50 8 L70 40 L30 40 Z" fill={`url(#${id}g)`} />
      <rect x="47.5" y="3" width="5" height="7" rx="1" fill="var(--gold-bright)" />
      <path d="M30 44 L41 44 L41 82 L24 82 Z" fill={`url(#${id}e)`} />
      <path d="M59 44 L70 44 L76 82 L59 82 Z" fill={`url(#${id}s)`} />
      <rect x="26" y="40" width="48" height="6" fill={`url(#${id}g)`} />
      <path d="M44 46 L56 46 L56 82 L44 82 Z" fill="var(--obsidian)" opacity="0.9" />
      <path d="M44 46 L56 46 L56 50 L44 50 Z" fill="var(--gold)" opacity="0.55" />
      <rect x="20" y="84" width="60" height="4" fill="var(--marble-2)" />
      <rect x="15" y="90" width="70" height="4" fill="var(--marble-3)" opacity="0.7" />
    </svg>
  );
};

// ---------------------------------------------------------------------
// Wordmark — logomark + AERARIUM in display caps
// ---------------------------------------------------------------------
export const Wordmark = ({ size = 34, mark = true, sub = true }: { size?: number; mark?: boolean; sub?: boolean }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: size * 0.34 }}>
    {mark && <Logomark size={size * 1.18} />}
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
      <span style={{
        fontFamily: "var(--font-display)", fontWeight: 500,
        fontSize: size, letterSpacing: "0.14em", color: "var(--marble)",
        textTransform: "uppercase",
      }}>Aerarium</span>
      {sub && (
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: size * 0.26,
          letterSpacing: "0.34em", color: "var(--marble-3)",
          textTransform: "uppercase", marginTop: size * 0.16, marginLeft: "0.1em",
        }}>The Treasury</span>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------
// Button — gold / outline / ghost / chain variants. Routes via Next
// <Link> when `href` is set; otherwise a <button> with onClick.
// ---------------------------------------------------------------------
type ButtonVariant = "gold" | "outline" | "ghost" | "chain";
export const Button = ({
  variant = "gold", children, onClick, href, size = "md", full, style, chain,
}: {
  variant?: ButtonVariant;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  size?: "sm" | "md" | "lg";
  full?: boolean;
  style?: CSSProperties;
  chain?: Side;
}) => {
  const [h, setH] = useState(false);
  const sizes: Record<"sm" | "md" | "lg", CSSProperties> = {
    sm: { padding: "8px 16px", fontSize: 12.5 },
    md: { padding: "12px 22px", fontSize: 13.5 },
    lg: { padding: "16px 30px", fontSize: 15 },
  };
  const chainColor = chain === "evm" ? "var(--evm)" : chain === "sol" ? "var(--sol)" : undefined;
  const variants: Record<ButtonVariant, CSSProperties> = {
    gold: {
      background: h ? "var(--rome-purple-hv)" : "var(--rome-purple)",
      // Fixed light text — the gold bg is always dark purple. --marble is light
      // on the dark landing but DARK ink in the light app, so it rendered
      // near-black-on-purple (unreadable) inside the app. --rome-cream is a fixed
      // brand light in both themes.
      color: "var(--rome-cream)", borderColor: "transparent",
      boxShadow: h ? "0 10px 34px -10px rgba(94,10,96,0.7)" : "0 2px 12px -5px rgba(94,10,96,0.55)",
    },
    outline: {
      background: h ? "rgba(244,238,226,0.06)" : "transparent",
      color: "var(--marble)", borderColor: "var(--stone-line-2)",
    },
    ghost: {
      background: h ? "rgba(244,238,226,0.06)" : "transparent",
      color: "var(--marble-2)", borderColor: "transparent",
    },
    chain: {
      background: h ? (chain === "evm" ? "var(--evm)" : "var(--sol)") : "transparent",
      color: h ? "var(--obsidian)" : (chainColor ?? "var(--marble)"),
      borderColor: chainColor ?? "var(--stone-line-2)",
    },
  };
  const buttonStyle: CSSProperties = {
    fontFamily: "var(--font-sans)", fontWeight: 600, letterSpacing: "0.02em",
    borderRadius: "var(--r-pill)", border: "1px solid",
    cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: 9, transition: "all var(--dur) var(--ease)", textTransform: "uppercase",
    width: full ? "100%" : "auto", whiteSpace: "nowrap", textDecoration: "none",
    ...sizes[size], ...variants[variant], ...style,
  };
  const shared = {
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: buttonStyle,
  };
  return href
    ? <Link href={href} {...shared} onClick={onClick}>{children}</Link>
    : <button type="button" {...shared} onClick={onClick}>{children}</button>;
};

// ---------------------------------------------------------------------
// Network pill ("Rome · Testnet")
// ---------------------------------------------------------------------
export const NetPill = ({ children, dot = "var(--pos)" }: { children: ReactNode; dot?: string }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 8,
    fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
    textTransform: "uppercase", color: "var(--marble-2)",
    border: "1px solid var(--stone-line-2)", borderRadius: "var(--r-pill)",
    padding: "6px 14px",
  }}>
    <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, animation: "aer-pulse 2.4s infinite" }} />
    {children}
  </span>
);

// ---------------------------------------------------------------------
// Chain glyphs (Ethereum diamond / Solana bars) + badge
// ---------------------------------------------------------------------
export const ChainGlyph = ({ chain, size = 12 }: { chain: Side; size?: number }) => {
  const c = CHAIN[chain];
  if (chain === "evm") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <path d="M12 2 L20 12 L12 16 L4 12 Z" fill={c.bright} opacity="0.95" />
        <path d="M12 17.5 L20 13.5 L12 22 L4 13.5 Z" fill={c.color} opacity="0.7" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M6 7 H19 L17 9.5 H4 Z" fill={c.bright} />
      <path d="M6 11 H19 L17 13.5 H4 Z" fill={c.color} />
      <path d="M6 15 H19 L17 17.5 H4 Z" fill={c.deep} />
    </svg>
  );
};

export const ChainBadge = ({ chain, size = "md", glyph = true }: { chain: Side; size?: "sm" | "md"; glyph?: boolean }) => {
  const c = CHAIN[chain];
  const s = size === "sm" ? { fs: 10, pad: "3px 8px", dot: 5 } : { fs: 11, pad: "4px 10px", dot: 6 };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: "var(--font-mono)", fontSize: s.fs, letterSpacing: "0.14em",
      textTransform: "uppercase", color: c.bright,
      background: c.wash, border: `1px solid ${c.color}`, borderRadius: "var(--r-sm)",
      padding: s.pad, fontWeight: 500, whiteSpace: "nowrap",
    }}>
      {glyph && <ChainGlyph chain={chain} size={s.dot * 2} />}
      {c.label}
    </span>
  );
};

// ---------------------------------------------------------------------
// Animated counter (counts up on first scroll into view)
// ---------------------------------------------------------------------
export const useInView = (ref: RefObject<HTMLElement | null>, once = true): boolean => {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.top < vh && r.bottom > 0) { setSeen(true); if (once) return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setSeen(true); if (once) io.disconnect(); } });
    }, { threshold: 0.2 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref, once]);
  return seen;
};

export const Counter = ({
  value, prefix = "", suffix = "", decimals = 0, dur = 1400, style,
}: {
  value: number; prefix?: string; suffix?: string; decimals?: number; dur?: number; style?: CSSProperties;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    let raf = 0;
    let t0: number | undefined;
    let done = false;
    const finish = () => { if (!done) { done = true; setN(value); } };
    const step = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) raf = requestAnimationFrame(step); else finish();
    };
    raf = requestAnimationFrame(step);
    const timer = setTimeout(finish, dur + 120);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [seen, value, dur]);
  const formatted = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span ref={ref} className="aer-num" style={style}>{prefix}{formatted}{suffix}</span>;
};

// ---------------------------------------------------------------------
// Split bar — proportion of EVM vs Solana within one shared pool
// ---------------------------------------------------------------------
export const SplitBar = ({
  evm, sol, height = 14, showLabels = true, animate = true,
}: {
  evm: number; sol: number; height?: number; showLabels?: boolean; animate?: boolean;
}) => {
  const total = evm + sol || 1;
  const ep = (evm / total) * 100;
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const w = animate ? (seen ? ep : 50) : ep;
  return (
    <div ref={ref}>
      <div style={{
        display: "flex", height, borderRadius: "var(--r-pill)", overflow: "hidden",
        border: "1px solid var(--stone-line-2)", background: "var(--basalt)",
      }}>
        <div style={{ width: `${w}%`, background: "linear-gradient(90deg, var(--evm-deep), var(--evm))", transition: "width 1.1s var(--ease)" }} />
        <div style={{ width: `${100 - w}%`, background: "linear-gradient(90deg, var(--sol), var(--sol-deep))", transition: "width 1.1s var(--ease)" }} />
      </div>
      {showLabels && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--evm-bright)" }}>
            <ChainGlyph chain="evm" size={13} /> {((evm / total) * 100).toFixed(0)}% from Ethereum
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--sol-bright)" }}>
            {((sol / total) * 100).toFixed(0)}% from Solana <ChainGlyph chain="sol" size={13} />
          </span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------
// Section scaffolding
// ---------------------------------------------------------------------
export const Section = ({ id, children, style, bleed }: { id?: string; children: ReactNode; style?: CSSProperties; bleed?: boolean }) => (
  <section id={id} style={{
    position: "relative", zIndex: 1,
    maxWidth: bleed ? "none" : "var(--maxw)", margin: "0 auto",
    padding: bleed ? 0 : "0 var(--gutter)", ...style,
  }}>{children}</section>
);

export const SectionHead = ({
  eyebrow, title, intro, align = "left", titleSize = 40, preview = false,
}: {
  eyebrow?: ReactNode; title: ReactNode; intro?: ReactNode; align?: "left" | "center"; titleSize?: number; preview?: boolean;
}) => (
  <div style={{ textAlign: align, maxWidth: align === "center" ? 720 : 760, margin: align === "center" ? "0 auto" : 0 }}>
    {eyebrow && (
      <div className="aer-eyebrow" style={{ marginBottom: 16, display: "inline-flex", alignItems: "center", gap: 12 }}>
        {eyebrow}
        {preview && <PreviewBadge />}
      </div>
    )}
    <h2 className="aer-display" style={{ fontSize: titleSize, margin: 0, fontWeight: 400 }}>{title}</h2>
    {intro && <p style={{ marginTop: 16, fontSize: 17, color: "var(--marble-2)", lineHeight: 1.6 }}>{intro}</p>}
  </div>
);

export const Rule = ({ style }: { style?: CSSProperties }) => <div style={{ height: 1, background: "var(--stone-line)", ...style }} />;

// Decorative gold meander/key divider
export const Meander = ({ w = 120, color = "var(--gold)" }: { w?: number; color?: string }) => (
  <svg className="aer-meander" width={w} height="10" viewBox="0 0 120 10" fill="none" style={{ opacity: 0.7 }}>
    <path d="M0 5 H12 V1 H22 V8 H17 M30 5 H42 V1 H52 V8 H47 M60 5 H72 V1 H82 V8 H77 M90 5 H102 V1 H112 V8 H107"
      stroke={color} strokeWidth="1.3" />
  </svg>
);

// "Preview" badge — shown wherever a section is fed illustrative data.
export const PreviewBadge = ({ label = "Preview data" }: { label?: string }) => (
  <span className="aer-preview-badge" title="Illustrative figures — not live on-chain data yet.">{label}</span>
);

// ---------------------------------------------------------------------
// Powered by Rome — co-brand lockup using the real Rome mark
// ---------------------------------------------------------------------
export const RomeLockup = ({ size = 18, label = "Powered by", color = "white" }: { size?: number; label?: string; color?: "white" | "purple" }) => {
  const suffix = color === "purple" ? "" : "-white";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      {label && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--marble-3)" }}>{label}</span>}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/brand/logomark-tight${suffix}.svg`} alt="" style={{ height: size, width: "auto", display: "block" }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/brand/wordmark-tight${suffix}.svg`} alt="Rome" style={{ height: size * 0.92, width: "auto", display: "block" }} />
      </span>
    </span>
  );
};
