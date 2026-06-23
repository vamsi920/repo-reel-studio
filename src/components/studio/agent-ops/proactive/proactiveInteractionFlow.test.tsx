import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAgentOpsProactive } from "@/components/studio/agent-ops/useAgentOpsProactive";
import {
  makeProactiveCandidate,
  makeProactiveStatus,
} from "@/components/studio/agent-ops/test/proactiveTestFixtures";
import type { AgentRun } from "@/lib/agentRuns";
import * as proactiveApi from "@/lib/proactiveAgentOps";

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/lib/proactiveAgentOps", async (importOriginal) => {
  const actual = await importOriginal<typeof proactiveApi>();
  return {
    ...actual,
    getProactiveStatus: vi.fn(),
    updateProactiveConfig: vi.fn(),
    dispatchProactiveDaily: vi.fn(),
    approveProactiveCandidate: vi.fn(),
    dismissProactiveCandidate: vi.fn(),
  };
});

const repoUrl = "https://github.com/o/r";

function makeRun(id: string): AgentRun {
  return {
    id,
    repoUrl,
    issueUrl: `${repoUrl}/issues/1`,
    status: "awaiting_review",
    updatedAt: "2026-05-27T12:00:00.000Z",
    createdAt: "2026-05-27T12:00:00.000Z",
    timeline: [],
    artifacts: {},
    evaluation: { riskLevel: "low", confidenceLevel: "medium" },
    approval: { branchName: "fix-1" },
  } as AgentRun;
}

function renderProactiveHook(initialRuns: AgentRun[] = []) {
  const setRuns = vi.fn();
  const setSelectedRunId = vi.fn();
  const setWorkspaceTab = vi.fn();
  const setActiveTab = vi.fn();
  const loadRuns = vi.fn().mockResolvedValue(true);

  const view = renderHook(
    ({ runs }) =>
      useAgentOpsProactive({
        repoUrl,
        repoName: "o/r",
        projectId: "proj-1",
        contextHints: null,
        runs,
        selectedRunId: runs[0]?.id ?? null,
        setRuns,
        setSelectedRunId,
        setWorkspaceTab,
        setActiveTab,
        loadRuns,
      }),
    { initialProps: { runs: initialRuns } },
  );

  return { ...view, setRuns, setSelectedRunId, setWorkspaceTab, setActiveTab, loadRuns };
}

describe("proactive interaction flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(proactiveApi.getProactiveStatus).mockResolvedValue(
      makeProactiveStatus({
        ready: 1,
        candidates: [makeProactiveCandidate("c1", { status: "review_ready", runId: "run-1" })],
      }),
    );
  });

  it("loads proactive status on mount", async () => {
    const { result } = renderProactiveHook();

    await waitFor(() => {
      expect(result.current.proactiveStatus?.candidates).toHaveLength(1);
    });
    expect(proactiveApi.getProactiveStatus).toHaveBeenCalled();
    expect(result.current.selectedProactiveId).toBe("c1");
    expect(result.current.proactiveReadyCount).toBe(1);
  });

  it("surfaces backend unavailable on status load failure", async () => {
    vi.mocked(proactiveApi.getProactiveStatus).mockRejectedValue(new Error("Proactive backend is unavailable."));
    const { result } = renderProactiveHook();

    await waitFor(() => {
      expect(result.current.proactiveBackendAttention?.message).toContain("unavailable");
    });
  });

  it("enables proactive and refreshes status", async () => {
    const enabledStatus = makeProactiveStatus({
      config: {
        repoUrl,
        enabled: true,
        targetCount: 6,
        qualityMode: "high",
        timezone: "UTC",
        morningDeadline: "09:00",
        updatedAt: "2026-05-27T12:00:00.000Z",
      },
      ready: 2,
      candidates: [
        makeProactiveCandidate("c1"),
        makeProactiveCandidate("c2"),
      ],
    });
    vi.mocked(proactiveApi.updateProactiveConfig).mockResolvedValue(enabledStatus.config);
    vi.mocked(proactiveApi.getProactiveStatus)
      .mockResolvedValueOnce(makeProactiveStatus({ ready: 0, candidates: [] }))
      .mockResolvedValue(enabledStatus);

    const { result } = renderProactiveHook();

    await waitFor(() => expect(result.current.proactiveStatus).not.toBeNull());

    await act(async () => {
      await result.current.toggleProactive(true);
    });

    expect(proactiveApi.updateProactiveConfig).toHaveBeenCalledWith({
      repoUrl,
      projectId: "proj-1",
      enabled: true,
    });
    await waitFor(() => {
      expect(result.current.proactiveStatus?.candidates).toHaveLength(2);
    });
  });

  it("dispatches scan and updates ready count", async () => {
    const dispatched = makeProactiveStatus({
      ready: 3,
      candidates: [
        makeProactiveCandidate("c1"),
        makeProactiveCandidate("c2"),
        makeProactiveCandidate("c3"),
      ],
      dispatchStatus: "complete",
    });
    vi.mocked(proactiveApi.dispatchProactiveDaily).mockResolvedValue(dispatched);

    const { result } = renderProactiveHook();

    await waitFor(() => expect(result.current.proactiveStatus).not.toBeNull());

    await act(async () => {
      await result.current.dispatchProactive();
    });

    expect(proactiveApi.dispatchProactiveDaily).toHaveBeenCalled();
    expect(result.current.proactiveReadyCount).toBe(3);
  });

  it("selects candidate and opens linked run in runs workspace", async () => {
    const candidate = makeProactiveCandidate("c1", { runId: "run-99" });
    vi.mocked(proactiveApi.getProactiveStatus).mockResolvedValue(
      makeProactiveStatus({ candidates: [candidate] }),
    );

    const { result, setWorkspaceTab, setSelectedRunId, setActiveTab, loadRuns } = renderProactiveHook();

    await waitFor(() => expect(result.current.selectedProactiveId).toBe("c1"));

    await act(async () => {
      await result.current.selectCandidateRun(candidate);
    });

    expect(setWorkspaceTab).toHaveBeenCalledWith("runs");
    expect(setSelectedRunId).toHaveBeenCalledWith("run-99");
    expect(setActiveTab).toHaveBeenCalledWith("summary");
    expect(loadRuns).toHaveBeenCalledWith("run-99");
    expect(result.current.selectedProactiveId).toBe("c1");
  });

  it("approves candidate and switches to linked run", async () => {
    const candidate = makeProactiveCandidate("c1", { status: "review_ready" });
    const run = makeRun("run-approve");
    vi.mocked(proactiveApi.approveProactiveCandidate).mockResolvedValue({
      candidate: { ...candidate, status: "approved_internal" },
      run,
    });

    const { result, setRuns, setSelectedRunId, setWorkspaceTab } = renderProactiveHook();

    await waitFor(() => expect(result.current.proactiveStatus).not.toBeNull());

    await act(async () => {
      await result.current.approveCandidate(candidate);
    });

    expect(proactiveApi.approveProactiveCandidate).toHaveBeenCalledWith("c1");
    expect(setRuns).toHaveBeenCalled();
    expect(setSelectedRunId).toHaveBeenCalledWith("run-approve");
    expect(setWorkspaceTab).toHaveBeenCalledWith("runs");
  });

  it("dismisses candidate and advances selection", async () => {
    const c1 = makeProactiveCandidate("c1");
    const c2 = makeProactiveCandidate("c2");
    vi.mocked(proactiveApi.getProactiveStatus).mockResolvedValue(
      makeProactiveStatus({ candidates: [c1, c2], ready: 2 }),
    );
    vi.mocked(proactiveApi.dismissProactiveCandidate).mockResolvedValue({
      candidate: { ...c1, status: "dismissed" },
      batch: null,
    });

    const { result } = renderProactiveHook();

    await waitFor(() => expect(result.current.selectedProactiveId).toBe("c1"));

    await act(async () => {
      await result.current.dismissCandidate(c1);
    });

    await waitFor(() => {
      expect(result.current.proactiveStatus?.candidates.map((item) => item.id)).toEqual(["c2"]);
      expect(result.current.selectedProactiveId).toBe("c2");
    });
  });

  it("applyProactiveHealthAttention does not clear fetch errors", async () => {
    vi.mocked(proactiveApi.getProactiveStatus).mockRejectedValue(
      new Error("Proactive backend is unavailable."),
    );
    const { result } = renderProactiveHook();

    await waitFor(() => {
      expect(result.current.proactiveBackendAttention?.message).toContain("unavailable");
    });

    act(() => {
      result.current.applyProactiveHealthAttention(null);
    });

    expect(result.current.proactiveBackendAttention?.message).toContain("unavailable");
  });
});
