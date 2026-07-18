"use client";
// =====================================================================
// AERARIUM landing — composition root
// Mirrors design/aer-app.jsx's <App>, minus the connect-modal / tweaks
// panel / wallet wiring (this is the read-only marketing front page).
// Section order matches the designer: Nav → Hero → SharedPool → Arena →
// Liquidations → Gates → Markets → Footer, over the marble backdrop.
//
// All data is fetched server-side in app/page.tsx and passed in as
// props so the section components stay presentational + typed.
// =====================================================================
import type { PoolSplit, ArenaStats, OpenLiquidation, MarketRow, ActivityRow } from "@/lib/market/MarketSource";
import { Nav } from "./Nav";
import { Hero } from "./Hero";
import { SharedPool } from "./SharedPool";
import { Arena } from "./Arena";
import { Liquidations } from "./Liquidations";
import { RecentActivity } from "./RecentActivity";
import { Gates } from "./Gates";
import { Markets } from "./Markets";
import { Footer } from "./Footer";

// Marble veining backdrop (feTurbulence) — subtle, behind everything.
const MarbleVeins = () => (
  <svg className="aer-marble-veins" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <filter id="aer-marble" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.006" numOctaves={3} seed={7} result="n" />
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

export interface AerariumLandingData {
  pool: PoolSplit;
  arena: ArenaStats;
  liquidations: OpenLiquidation[];
  markets: MarketRow[];
  activity: ActivityRow[];
}

export const AerariumLanding = ({ pool, arena, liquidations, markets, activity }: AerariumLandingData) => (
  // .aerarium-landing scopes the designer's dark tokens (app/aerarium-landing.css)
  // so the rest of the light-only app is untouched.
  <div className="aerarium-landing">
    <div className="aer-marble-bg" />
    <MarbleVeins />

    <Nav />
    <Hero pool={pool} />
    <SharedPool pool={pool} />
    <Arena arena={arena} />
    <Liquidations liquidations={liquidations} />
    <Gates />
    <Markets markets={markets} />
    <RecentActivity activity={activity} />
    <Footer />
  </div>
);
