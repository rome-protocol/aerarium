// Solana lane segment layout. Mounts the Solana wallet stack (connection +
// wallet adapter + modal) so it exists ONLY under /solana/* — the landing and
// the EVM lane never load these libraries. The wallet-adapter modal styles are
// scoped here for the same reason.
import "@solana/wallet-adapter-react-ui/styles.css";
import { SolanaProviders } from "../providers-solana";

export default function SolanaLayout({ children }: { children: React.ReactNode }) {
  return <SolanaProviders>{children}</SolanaProviders>;
}
