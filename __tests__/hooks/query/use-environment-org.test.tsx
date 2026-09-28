/**
 * Regression coverage for INC-8: the environment org lookup used to always
 * resolve successfully (even on a real internal Supabase failure), so a
 * genuine lookup failure was indistinguishable from "no org yet" to every
 * consumer. `resolveOrgIdWithStatus` (the underlying service this hook
 * depends on) now reports whether the lookup itself failed, and
 * `useEnvironmentOrgId` turns that into a real react-query `isError` a
 * caller can act on, while keeping `data` exactly `string | null` for every
 * existing consumer that only checks its truthiness.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEnvironmentOrgId } from "#/hooks/query/use-environment-org";

const { resolveOrgIdWithStatusMock } = vi.hoisted(() => ({
  resolveOrgIdWithStatusMock: vi.fn(),
}));

vi.mock("#/lib/data-platform/repositories/repository-identity", () => ({
  resolveOrgIdWithStatus: (...args: unknown[]) =>
    resolveOrgIdWithStatusMock(...args),
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: null,
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  resolveOrgIdWithStatusMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useEnvironmentOrgId", () => {
  it("resolves with the org id when the lookup succeeds", async () => {
    resolveOrgIdWithStatusMock.mockResolvedValue({
      orgId: "org-1",
      hadError: false,
    });

    const { result } = renderHook(() => useEnvironmentOrgId(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBe("org-1"));
    expect(result.current.isError).toBe(false);
  });

  it("resolves with null and no error when there is genuinely no session yet", async () => {
    resolveOrgIdWithStatusMock.mockResolvedValue({
      orgId: null,
      hadError: false,
    });

    const { result } = renderHook(() => useEnvironmentOrgId(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it("reports isError, not a silent null, when the org lookup itself failed", async () => {
    resolveOrgIdWithStatusMock.mockResolvedValue({
      orgId: null,
      hadError: true,
    });

    const { result } = renderHook(() => useEnvironmentOrgId(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
