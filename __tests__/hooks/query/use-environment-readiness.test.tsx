import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEnvironmentReadiness } from "#/hooks/query/use-environment-readiness";
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";

const state = vi.hoisted(() => ({
  supabaseConfigured: true,
  github: { isLoading: false, isPending: false, data: null as unknown },
  jira: { isLoading: false, isPending: false, data: null as unknown },
  settings: { isLoading: false, data: undefined as { llm_model?: string } | undefined },
  connections: { isLoading: false, isPending: false, data: [] as ConnectionRecord[] },
}));

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return state.supabaseConfigured;
  },
  supabase: null,
}));

vi.mock("#/hooks/query/use-github-connection", () => ({
  useGithubConnection: () => state.github,
}));

vi.mock("#/hooks/query/use-jira-connection", () => ({
  useJiraConnection: () => state.jira,
}));

vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => state.settings,
}));

vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => state.connections,
}));

function githubConnectionRecord(
  overrides: Partial<ConnectionRecord> = {},
): ConnectionRecord {
  return {
    id: "conn-1",
    orgId: "org-1",
    capability: "source-control",
    providerId: "github",
    instanceKey: "default",
    displayName: "vamsi920",
    config: {},
    redactedSummary: {},
    requestedScopes: ["repo", "read:user"],
    grantedScopes: [],
    status: "ok",
    lastProbe: null,
    lastProbeAt: null,
    expiresAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("useEnvironmentReadiness", () => {
  it("reports source-control missing when there is no connection at all", () => {
    state.github = { isLoading: false, isPending: false, data: null };
    state.connections = { isLoading: false, isPending: false, data: [] };

    const { result } = renderHook(() => useEnvironmentReadiness(null));

    expect(result.current.byCapability["source-control"]).toBe("missing");
  });

  it("reports source-control ok when a connection row exists and nothing has probed it as broken", () => {
    state.github = { isLoading: false, isPending: false, data: { id: "row" } };
    state.connections = { isLoading: false, isPending: false, data: [] };

    const { result } = renderHook(() => useEnvironmentReadiness(null));

    expect(result.current.byCapability["source-control"]).toBe("ok");
  });

  // This is the actual bug: a connection row existing was previously the
  // only signal used, so a GitHub token accepted-but-underscoped (proven by
  // the Connections tab's own "Test" probe) still reported fully "Connected"
  // on the Overview page. The probe's persisted status must be able to pull
  // the capability down from "ok".
  it("downgrades source-control to degraded when the persisted connection was probed and found scope-limited", () => {
    state.github = { isLoading: false, isPending: false, data: { id: "row" } };
    state.connections = {
      isLoading: false,
      isPending: false,
      data: [githubConnectionRecord({ status: "degraded" })],
    };

    const { result } = renderHook(() => useEnvironmentReadiness(null));

    expect(result.current.byCapability["source-control"]).toBe("degraded");
  });

  it("reports source-control missing when the persisted connection's last probe failed outright", () => {
    state.github = { isLoading: false, isPending: false, data: { id: "row" } };
    state.connections = {
      isLoading: false,
      isPending: false,
      data: [githubConnectionRecord({ status: "error" })],
    };

    const { result } = renderHook(() => useEnvironmentReadiness(null));

    expect(result.current.byCapability["source-control"]).toBe("missing");
  });

  it("stays unknown while the connections list is still loading, even if the old connection row already resolved", () => {
    state.github = { isLoading: false, isPending: false, data: { id: "row" } };
    state.connections = { isLoading: true, isPending: true, data: [] };

    const { result } = renderHook(() => useEnvironmentReadiness(null));

    expect(result.current.byCapability["source-control"]).toBe("unknown");
  });

  it("stays unknown during cold start, when a disabled query reports isLoading:false but isPending:true (never fetched, not fetching yet)", () => {
    // Regression: a disabled react-query v5 query (gated behind the
    // auth/org bootstrap resolving) reports `isLoading: false` the instant
    // it mounts, since `isLoading = isPending && isFetching` and a disabled
    // query is never fetching. Only `isPending` distinguishes "confirmed no
    // connection" from "haven't looked yet" in that window.
    state.github = { isLoading: false, isPending: true, data: undefined };
    state.connections = { isLoading: false, isPending: true, data: [] };

    const { result } = renderHook(() => useEnvironmentReadiness(null));

    expect(result.current.byCapability["source-control"]).toBe("unknown");
  });

  it("does not let a second, non-default connection of the same capability override the default instance's status", () => {
    // Regression: matching on `capability` alone meant a second instance for
    // the same capability (e.g. a second GitHub Enterprise connection) could
    // downgrade -- or, as here, mask a real problem on -- the default
    // instance, depending on arbitrary array order from an unordered query.
    state.github = { isLoading: false, isPending: false, data: { id: "row" } };
    state.connections = {
      isLoading: false,
      isPending: false,
      data: [
        githubConnectionRecord({
          instanceKey: "default",
          status: "error",
        }),
        githubConnectionRecord({
          id: "conn-2",
          instanceKey: "secondary",
          status: "ok",
        }),
      ],
    };

    const { result } = renderHook(() => useEnvironmentReadiness(null));

    expect(result.current.byCapability["source-control"]).toBe("missing");
  });

  it("does not let an unrelated capability's connection record affect source-control", () => {
    state.github = { isLoading: false, isPending: false, data: { id: "row" } };
    state.connections = {
      isLoading: false,
      isPending: false,
      data: [
        githubConnectionRecord({
          capability: "issue-tracker",
          providerId: "jira",
          status: "error",
        }),
      ],
    };

    const { result } = renderHook(() => useEnvironmentReadiness(null));

    expect(result.current.byCapability["source-control"]).toBe("ok");
  });
});
