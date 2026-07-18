// Remembers the lane a user last entered, so the landing can offer a direct
// "Resume {lane}" fast path instead of making returning visitors re-run the
// gate picker. SSR-safe (no window → null) and value-validated. Client-only
// storage; reads must run in an effect, never during SSR render.
import type { LaneSide } from "@/components/aerarium/lane/types";

const KEY = "aer:lastLane";

export function getLastLane(): LaneSide | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "evm" || v === "sol" ? v : null;
  } catch {
    return null;
  }
}

export function setLastLane(side: LaneSide): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, side);
  } catch {
    /* storage unavailable (private mode / quota) — the fast path is optional */
  }
}
