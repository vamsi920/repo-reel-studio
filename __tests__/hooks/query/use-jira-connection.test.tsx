/**
 * Mirrors use-github-connection.test.tsx's identical INC-8-style regression
 * coverage for the Jira connection lookup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useJiraConnection } from "#/hooks/query/use-jira-connection";

const { getConnectionWithStatusMock } = vi.hoisted(() => ({
  getConnectionWithStatusMock: vi.fn(),
}));

vi.mock("#/lib/data-platform/repositories/jira-connections-repository", () => ({
  jiraConnectionsRepository: {
    getConnectionWithStatus: (...args: unknown[]) =>
      getConnectionWithStatusMock(...args),
  },
}));

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

describe("useJiraConnection", () => {
  it("resolves with the connection when the lookup succeeds", async () => {
    const connection = {
      siteName: "Acme",
      siteUrl: "https://acme.atlassian.net",
      atlassianEmail: "dev@acme.com",
      connectedAt: "2026-09-01T00:00:00.000Z",
      cloudId: "cloud-1",
    };
    getConnectionWithStatusMock.mockResolvedValue({
      connection,
      hadError: false,
    });

    const { result } = renderHook(() => useJiraConnection(), {
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

    const { result } = renderHook(() => useJiraConnection(), {
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

    const { result } = renderHook(() => useJiraConnection(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
