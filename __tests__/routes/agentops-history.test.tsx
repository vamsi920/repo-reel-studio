import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import AgentOpsHistory from "#/routes/agentops-history";
import type {
  AgentOpsAuditRecord,
  AgentOpsRun,
} from "#/api/agentops-service/agentops-service.types";

const runsQuery = vi.hoisted(() => vi.fn());
const auditQuery = vi.hoisted(() => vi.fn());

vi.mock("#/hooks/query/use-agentops", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/hooks/query/use-agentops")>()),
  useAgentOpsRuns: () => runsQuery(),
  useAgentOpsAudit: () => auditQuery(),
}));

const AUDIT_RECORD: AgentOpsAuditRecord = {
  id: "audit-1",
  at: "2026-01-01T00:00:00.000Z",
  actor: "user",
  action: "run.pause",
  summary: "Run paused from the Control Tower",
  entityType: "run",
  entityId: "run-1",
};

const FINISHED_RUN: AgentOpsRun = {
  runId: "run-1",
  workspaceId: "/workspace/project",
  agentName: "agent",
  task: "Refactor the parser",
  status: "finished",
  model: "anthropic/claude",
  phase: "completed",
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:05:00.000Z",
  updatedAt: "2026-01-01T00:05:00.000Z",
  costUsd: 0.42,
  maxBudgetPerTask: null,
  tokens: {
    prompt: 1,
    completion: 1,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    total: 2,
  },
  toolCallCount: 3,
  llmCallCount: 2,
  errorCount: 0,
  artifacts: [],
};

const loaded = (data: unknown) => ({ data, isLoading: false, error: null });
const failedRefetch = (data: unknown) => ({
  data,
  isLoading: false,
  error: new Error("Failed to fetch"),
});

function renderHistory() {
  // A fresh element each render call: React bails out of re-rendering a
  // subtree when it is handed the very same element object again.
  const ui = () => (
    <MemoryRouter>
      <AgentOpsHistory />
    </MemoryRouter>
  );
  const view = render(ui());
  return { ...view, rerender: () => view.rerender(ui()) };
}

describe("AgentOpsHistory", () => {
  it("shows the collector card when the very first fetch fails", () => {
    runsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Failed to fetch"),
    });
    auditQuery.mockReturnValue(loaded([]));

    renderHistory();

    expect(
      screen.getByTestId("agentops-collector-unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("agentops-audit-list")).not.toBeInTheDocument();
  });

  it("keeps the completed-runs table and audit log mounted behind a stale banner instead of tearing them down on a failed poll", () => {
    // Every Fly deploy restarts the collector for ~30s (AGENTS.md INC-3) — a
    // single failed background poll after real data has loaded must not
    // replace this tab's tables with the full-page "collector unavailable"
    // card.
    runsQuery.mockReturnValue(loaded([FINISHED_RUN]));
    auditQuery.mockReturnValue(loaded([AUDIT_RECORD]));
    const { rerender } = renderHistory();

    expect(screen.getByTestId("agentops-audit-list")).toBeInTheDocument();
    expect(screen.getByTestId("agentops-runs-table")).toBeInTheDocument();

    auditQuery.mockReturnValue(failedRefetch([AUDIT_RECORD]));
    rerender();

    expect(screen.getByTestId("agentops-collector-stale")).toBeInTheDocument();
    expect(screen.getByTestId("agentops-audit-list")).toBeInTheDocument();
    expect(screen.getByTestId("agentops-runs-table")).toBeInTheDocument();
    expect(
      screen.queryByTestId("agentops-collector-unavailable"),
    ).not.toBeInTheDocument();

    auditQuery.mockReturnValue(loaded([AUDIT_RECORD]));
    rerender();

    expect(
      screen.queryByTestId("agentops-collector-stale"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("agentops-audit-list")).toBeInTheDocument();
  });
});
