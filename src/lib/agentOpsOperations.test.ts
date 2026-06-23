import { describe, expect, it } from "vitest";

import { resolveProactiveOperation, resolveRunsOperation } from "@/lib/agentOpsOperations";

describe("agentOpsOperations", () => {
  it("prioritizes run approve over polling", () => {
    const op = resolveRunsOperation({
      loadingRuns: false,
      syncingRuns: true,
      refreshing: false,
      submitting: false,
      action: "approve",
      pollingActive: true,
    });
    expect(op?.label).toBe("Approving run…");
  });

  it("does not surface background poll/sync in the operation strip", () => {
    expect(
      resolveRunsOperation({
        loadingRuns: false,
        syncingRuns: true,
        refreshing: false,
        submitting: false,
        action: null,
        pollingActive: true,
      }),
    ).toBeNull();
    expect(
      resolveProactiveOperation({
        loading: false,
        syncing: true,
        action: null,
      }),
    ).toBeNull();
  });

  it("shows proactive dispatch", () => {
    const op = resolveProactiveOperation({
      loading: false,
      syncing: false,
      action: "dispatch",
    });
    expect(op?.label).toContain("Dispatching");
  });
});
