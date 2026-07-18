// =====================================================================
// Rome — Logo Lockup
// Drop this file into a Rome project to get the canonical logomark + ROME
// wordmark pair, tightly cropped and proportionally aligned.
//
// Usage:
//   <Lockup size={38} />                  // default — purple ink on light
//   <Lockup size={48} variant="white" />  // white ink for dark surfaces
//
// Required assets (copy these alongside this file):
//   logomark-tight.svg        (logomark cropped to its ink bounds + 20u pad)
//   wordmark-tight.svg        (wordmark cropped to letter ink bounds + 20u pad)
//   logomark-tight-white.svg  (white variant for dark surfaces)
//   wordmark-tight-white.svg  (white variant for dark surfaces)
//
// Both SVGs share the same vertical pad ratio, so equal `height` produces
// equal *visual* size — no per-side fudging needed.
// =====================================================================

const Lockup = ({
  size = 38,
  gap = Math.max(6, Math.round(size * 0.24)),
  basePath = 'assets',
  variant = 'purple',         // 'purple' | 'white'
  alt = 'Rome',
}) => {
  const suffix = variant === 'white' ? '-white' : '';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      <img
        src={`${basePath}/logomark-tight${suffix}.svg`}
        alt=""
        style={{ height: size, width: 'auto', display: 'block' }}
      />
      <img
        src={`${basePath}/wordmark-tight${suffix}.svg`}
        alt={alt}
        style={{ height: size, width: 'auto', display: 'block' }}
      />
    </div>
  );
};

if (typeof window !== 'undefined') Object.assign(window, { Lockup });
