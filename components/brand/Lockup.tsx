"use client";

interface LockupProps {
  size?: number;
  gap?: number;
  basePath?: string;
  variant?: "purple" | "white";
  alt?: string;
}

/// Rome — Logo Lockup
/// Logomark + ROME wordmark pair, tightly cropped + proportionally aligned.
/// Both SVGs share the same vertical pad ratio, so equal `height` produces
/// equal *visual* size — no per-side fudging needed.
export function Lockup({
  size = 38,
  gap,
  basePath = "/brand",
  variant = "purple",
  alt = "Rome",
}: LockupProps) {
  const computedGap =
    gap !== undefined ? gap : Math.max(6, Math.round(size * 0.24));
  const suffix = variant === "white" ? "-white" : "";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: computedGap,
      }}
    >
      <img
        src={`${basePath}/logomark-tight${suffix}.svg`}
        alt=""
        style={{ height: size, width: "auto", display: "block" }}
      />
      <img
        src={`${basePath}/wordmark-tight${suffix}.svg`}
        alt={alt}
        style={{ height: size, width: "auto", display: "block" }}
      />
    </div>
  );
}
