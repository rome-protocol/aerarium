// EVM lane segment layout. Mounts the EVM wallet stack (Wagmi + RainbowKit +
// React Query) so it exists ONLY under /evm/* — the landing and the Solana lane
// never load these libraries. RainbowKit's stylesheet is scoped here for the
// same reason.
import "@rainbow-me/rainbowkit/styles.css";
import { EvmProviders } from "../providers-evm";

export default function EvmLayout({ children }: { children: React.ReactNode }) {
  return <EvmProviders>{children}</EvmProviders>;
}
