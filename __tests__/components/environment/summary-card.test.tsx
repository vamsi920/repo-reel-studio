import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SummaryCard } from "#/components/features/environment/studio/cards/simple-cards";
import { invalidateConnectionCaches } from "#/lib/environment/invalidate-connection-caches";

vi.mock("#/lib/environment/invalidate-connection-caches", () => ({
  invalidateConnectionCaches: vi.fn().mockResolvedValue(undefined),
}));

function renderSummaryCard(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SummaryCard readinessScore={60} blockingCount={0} />
    </QueryClientProvider>,
  );
}

describe("SummaryCard", () => {
  it("refreshes readiness through the shared connection-cache invalidator, not a narrower ad hoc key", () => {
    // A bespoke `invalidateQueries({ queryKey: ["environment"] })` here would
    // miss ["github-connection"]/["jira-connection"] -- the two queries that
    // actually drive the source-control/issue-tracker readiness score this
    // card displays -- and the closing summary would show a stale score right
    // after a connection changes.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderSummaryCard(queryClient);

    expect(invalidateConnectionCaches).toHaveBeenCalledTimes(1);
    expect(invalidateConnectionCaches).toHaveBeenCalledWith(queryClient);
  });
});
