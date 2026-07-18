// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "../PageHeader";

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x6ba69E148C7ab4cb1d2A833De3B7f4B2889cB7Ad" as `0x${string}`, isConnected: true }),
  useChainId: () => 200010,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@rainbow-me/rainbowkit", () => {
  // ConnectButton.Custom is a render-prop component — invoke the child with a
  // minimal "not connected" state so the header falls into the "Connect wallet"
  // branch and produces a button we can assert on.
  const Custom = ({ children }: { children: (state: unknown) => React.ReactNode }) =>
    children({
      account: undefined,
      chain: undefined,
      mounted: true,
      openConnectModal: () => {},
      openAccountModal: () => {},
      openChainModal: () => {},
    });
  return { ConnectButton: { Custom } };
});

describe("PageHeader", () => {
  it("renders 7 nav links: Dashboard / Markets / Supply / Borrow / Liquidate / History / Faucet", () => {
    render(<PageHeader riskRatio={null} chainName="Rome Hadrian" />);
    for (const label of ["Dashboard", "Markets", "Supply", "Borrow", "Liquidate", "History", "Faucet"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("renders chain pill matching chainName prop (parameterized — not hardcoded)", () => {
    render(<PageHeader riskRatio={null} chainName="Rome Hadrian" />);
    expect(screen.getByText("Rome Hadrian")).toBeInTheDocument();
  });

  it("uses the chainName prop value (validates parameterization)", () => {
    render(<PageHeader riskRatio={null} chainName="Solana Mainnet Demo" />);
    expect(screen.getByText("Solana Mainnet Demo")).toBeInTheDocument();
    expect(screen.queryByText("Rome Hadrian")).not.toBeInTheDocument();
  });

  it("renders HF pill with computed value when riskRatio is provided", () => {
    render(<PageHeader riskRatio={0.7} chainName="Rome Hadrian" />);
    expect(screen.getByText("HF")).toBeInTheDocument();
    expect(screen.getByText("3.33")).toBeInTheDocument();
  });

  it("omits HF pill when riskRatio is null (no debt)", () => {
    render(<PageHeader riskRatio={null} chainName="Rome Hadrian" />);
    expect(screen.queryByText("HF")).not.toBeInTheDocument();
  });

  it("renders Connect wallet button via ConnectButton.Custom render-prop", () => {
    render(<PageHeader riskRatio={null} chainName="Rome Hadrian" />);
    expect(screen.getByRole("button", { name: /Connect wallet/i })).toBeInTheDocument();
  });
});
