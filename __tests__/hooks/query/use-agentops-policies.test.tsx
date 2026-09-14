import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAgentOpsPolicies } from "#/hooks/query/use-agentops";
import AgentOpsService, {
  AgentOpsUnavailableError,
} from "#/api/agentops-service/agentops-service.api";

vi.mock("#/api/agentops-service/agentops-service.api", async () => {
  const actual = await vi.importActual<
    typeof import("#/api/agentops-service/agentops-service.api")
  >("#/api/agentops-service/agentops-service.api");
  return {
    ...actual,
    isAgentOpsSupportedBackend: () => true,
    default: {
      ...actual.default,
      getPolicies: vi.fn(),
    },
  };
});

function createWrapper() {
  const queryClient = new QueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useAgentOpsPolicies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("recovers on its own after a transient collector outage", async () => {
    // Every Fly deploy restarts the collector for a few seconds. The first
    // request lands in that window; the collector is healthy again by the
    // time the next poll is due.
    const policies = { workspaces: {}, agents: {} };
    vi.mocked(AgentOpsService.getPolicies)
      .mockRejectedValueOnce(new AgentOpsUnavailableError("not reachable"))
      .mockResolvedValue(policies);

    const { result } = renderHook(() => useAgentOpsPolicies(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(AgentOpsService.getPolicies).toHaveBeenCalledTimes(1);

    // The Budgets tab refetches on its slow (30 s) cadence, and the policies
    // query must come back with it — otherwise the tab is stuck on the
    // "collector isn't running" card until it is remounted.
    await vi.advanceTimersByTimeAsync(30_000);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual(policies);
    expect(AgentOpsService.getPolicies).toHaveBeenCalledTimes(2);
  });
});
