// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { EnvProvider } from "@/lib/env-context";
import { ChainConfigGate } from "../chain-config-gate";
import { RootProviders } from "../providers";

// The aerarium-martius incident: /api/env resolves to a chain id the build's
// registry snapshot doesn't contain. Without a guard the wagmi config silently
// falls back to the default chain, usePublicClient({ chainId }) returns
// undefined, every read no-ops, and the UI spins on "Loading your positions…"
// forever. The gate must turn that state into an explicit error.

const ORIGINAL_FETCH = global.fetch;
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

function mockEnv(defaultChainId: number | null) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ defaultChainId }),
  } as Response);
}

describe("ChainConfigGate", () => {
  it("renders an explicit error — not the app — when the runtime chain is missing from the build", async () => {
    mockEnv(999999);
    render(
      <EnvProvider>
        <ChainConfigGate>
          <div data-testid="app" />
        </ChainConfigGate>
      </EnvProvider>,
    );
    await waitFor(() => expect(screen.getByText(/999999/)).toBeInTheDocument());
    expect(screen.getByText(/not included in this build/i)).toBeInTheDocument();
    expect(screen.queryByTestId("app")).toBeNull();
  });

  it("renders the app when the runtime chain exists in the snapshot", async () => {
    mockEnv(200010); // hadrian — always in generated.json
    render(
      <EnvProvider>
        <ChainConfigGate>
          <div data-testid="app" />
        </ChainConfigGate>
      </EnvProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("app")).toBeInTheDocument());
  });

  it("renders the app while /api/env is still resolving (no error flash)", () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;
    render(
      <EnvProvider>
        <ChainConfigGate>
          <div data-testid="app" />
        </ChainConfigGate>
      </EnvProvider>,
    );
    expect(screen.getByTestId("app")).toBeInTheDocument();
  });

  it("renders the app when /api/env resolves no chain id (build default applies)", async () => {
    mockEnv(null);
    render(
      <EnvProvider>
        <ChainConfigGate>
          <div data-testid="app" />
        </ChainConfigGate>
      </EnvProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("app")).toBeInTheDocument());
  });
});

describe("RootProviders mounts the gate", () => {
  it("blocks the whole tree on an unknown runtime chain", async () => {
    mockEnv(999999);
    render(
      <RootProviders>
        <div data-testid="app" />
      </RootProviders>,
    );
    await waitFor(() => expect(screen.getByText(/not included in this build/i)).toBeInTheDocument());
    expect(screen.queryByTestId("app")).toBeNull();
  });
});
