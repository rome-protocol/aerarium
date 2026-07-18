// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { EnvProvider, useEnv } from "../env-context";

describe("EnvProvider", () => {
  const ORIGINAL_FETCH = global.fetch;
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = ORIGINAL_FETCH;
  });
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it("starts not-ready, then exposes defaultChainId after /api/env resolves", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ defaultChainId: 200010 }),
    } as Response);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <EnvProvider>{children}</EnvProvider>
    );
    const { result } = renderHook(() => useEnv(), { wrapper });

    expect(result.current.ready).toBe(false);
    expect(result.current.defaultChainId).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.defaultChainId).toBe(200010);
  });

  it("exposes defaultChainId=null when /api/env returns null", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ defaultChainId: null }),
    } as Response);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <EnvProvider>{children}</EnvProvider>
    );
    const { result } = renderHook(() => useEnv(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.defaultChainId).toBeNull();
  });

  it("stays not-ready when fetch errors; surfaces the error", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("network down"));

    const wrapper = ({ children }: { children: ReactNode }) => (
      <EnvProvider>{children}</EnvProvider>
    );
    const { result } = renderHook(() => useEnv(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.ready).toBe(false);
    expect(result.current.error?.message).toMatch(/network down/);
  });

  it("throws useful error when useEnv is used outside EnvProvider", () => {
    expect(() => renderHook(() => useEnv())).toThrow(/EnvProvider/);
  });

  it("stays not-ready and populates error when /api/env returns non-ok status", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ message: "service unavailable" }),
    } as Response);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <EnvProvider>{children}</EnvProvider>
    );
    const { result } = renderHook(() => useEnv(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.ready).toBe(false);
    expect(result.current.error?.message).toMatch(/503/);
  });

  it("exposes walletConnectProjectId from /api/env", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ defaultChainId: 200010, walletConnectProjectId: "abc123" }),
    } as Response);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EnvProvider>{children}</EnvProvider>
    );
    const { result } = renderHook(() => useEnv(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.walletConnectProjectId).toBe("abc123");
  });

  it("falls back walletConnectProjectId to '' (empty) when /api/env omits it", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ defaultChainId: null }),
    } as Response);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EnvProvider>{children}</EnvProvider>
    );
    const { result } = renderHook(() => useEnv(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.walletConnectProjectId).toBe("");
  });
});
