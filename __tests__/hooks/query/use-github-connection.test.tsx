/**
 * Regression coverage for an INC-8-style gap: `githubConnectionsRepository
 * .getConnection()` never rejects, so a real lookup failure (e.g. an
 * auth-timing glitch) was indistinguishable from a genuine "never
 * connected" result to every consumer of `useGithubConnection`. The query
 * function now rejects when `getConnectionWithStatus()` reports
 * `hadError: true`, giving callers a real `isError` signal while `data`
 * keeps its exact `GithubConnectionStatus | null` shape on every other
 * path. Mirrors `__tests__/hooks/query/use-environment-org.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGithubConnection } from "#/hooks/query/use-github-connection";

const { getConnectionWithStatusMock } = vi.hoisted(() => ({
  getConnectionWithStatusMock: vi.fn(),
}));

vi.mock(
  "#/lib/data-platform/repositories/github-connections-repository",
  () => ({
    githubConnectionsRepository: {
      getConnectionWithStatus: (...args: unknown[]) =>
        getConnectionWithStatusMock(...args),
    },
  }),
);

vi.mock("#/hooks/query/use-supabase-session", () => ({
  useSupabaseSession: () => ({ status: "real", user: null }),
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
  getConnectionWithStatusMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useGithubConnection", () => {
  it("resolves with the connection when the lookup succeeds", async () => {
    const connection = {
      githubUsername: "octocat",
      enterpriseHost: null,
      connectedAt: "2026-09-01T00:00:00.000Z",
    };
    getConnectionWithStatusMock.mockResolvedValue({
      connection,
      hadError: false,
    });

    const { result } = renderHook(() => useGithubConnection(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(connection));
    expect(result.current.isError).toBe(false);
  });

  it("resolves with null and no error when there is genuinely no connection", async () => {
    getConnectionWithStatusMock.mockResolvedValue({
      connection: null,
      hadError: false,
    });

    const { result } = renderHook(() => useGithubConnection(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it("reports isError, not a silent null, when the connection lookup itself failed", async () => {
    getConnectionWithStatusMock.mockResolvedValue({
      connection: null,
      hadError: true,
    });

    const { result } = renderHook(() => useGithubConnection(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
