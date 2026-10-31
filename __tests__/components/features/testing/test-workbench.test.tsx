import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import { TestWorkbench } from "#/components/features/testing/studio/test-workbench";
import { useTestStudioStore } from "#/stores/test-studio-store";
import { buildReport } from "#/lib/testing/report";
import { DEFAULT_GATES } from "#/lib/testing/gates";
import type { SuitePlan } from "#/lib/testing/model";

// The live box reads conversation metrics through the websocket/query stack.
vi.mock("#/hooks/use-live-conversation-metrics", () => ({
  useLiveConversationMetrics: () => ({
    cost: null,
    usage: null,
    max_budget_per_task: null,
  }),
}));
vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({ default: { sendMessage: vi.fn().mockResolvedValue(undefined) } }),
);
vi.mock("#/api/automation-service/automation-service.api", () => ({
  default: {
    createAutomationDraft: vi.fn().mockResolvedValue({ id: "auto-7" }),
  },
}));

const PLAN: SuitePlan[] = [
  {
    id: "unit",
    kind: "unit",
    name: "Vitest",
    command: "npx vitest run",
    results: [{ path: "j.xml", format: "junit" }],
    origin: "existing",
  },
  {
    id: "perf",
    kind: "performance",
    name: "k6 checkout",
    command: "k6 run",
    results: [{ path: "k6.json", format: "k6" }],
    origin: "agent",
  },
  {
    id: "a11y",
    kind: "accessibility",
    name: "axe",
    command: "",
    results: [],
    origin: "agent",
    notApplicable: "CLI tool",
  },
];

function reportFor(
  projectId: string,
  unit: ("passed" | "failed")[],
  p95 = 120,
) {
  return buildReport({
    runId: `run-${unit.join("")}`,
    projectId,
    plan: PLAN,
    executed: ["unit", "perf"],
    status: {
      version: 1,
      runId: "r",
      startedAt: "a",
      finishedAt: "b",
      commit: "abc1234",
      suites: [
        {
          id: "unit",
          status: "passed",
          exitCode: 0,
          durationMs: 1000,
          artifacts: [],
        },
        {
          id: "perf",
          status: "passed",
          exitCode: 0,
          durationMs: 5000,
          artifacts: [],
        },
      ],
    },
    artifactsBySuite: {
      unit: [
        {
          path: "j.xml",
          format: "junit",
          warnings: [],
          cases: unit.map((s, i) => ({
            id: `t${i}`,
            name: `case ${i}`,
            status: s,
            message: s === "failed" ? "expected 1" : undefined,
          })),
          coverage: {
            lines: { covered: 75, total: 100, pct: 75 },
            hotspots: [{ file: "src/cart.ts", uncoveredLines: 25, pct: 50 }],
            source: "lcov",
          },
        },
      ],
      perf: [
        {
          path: "k6.json",
          format: "k6",
          warnings: [],
          perf: [
            {
              name: "checkout",
              requests: 100,
              p95Ms: p95,
              errorRate: 0,
              thresholds: [],
              source: "k6",
            },
          ],
        },
      ],
    },
    gates: DEFAULT_GATES,
    trigger: "agent",
    startedAt: "2026-10-30T10:00:00Z",
    finishedAt: "2026-10-30T10:05:00Z",
  });
}

describe("TestWorkbench", () => {
  let projectId: string;
  beforeEach(() => {
    const store = useTestStudioStore.getState();
    store.reset();
    projectId = store.createProject({
      name: "shop",
      source: { kind: "folder", name: "/work/shop" },
    }).id;
  });

  function render(onRun = vi.fn(), canRun = true) {
    return renderWithProviders(
      <TestWorkbench
        projectId={projectId}
        postResult={vi.fn()}
        onRun={onRun}
        busy={false}
        canRun={canRun}
      />,
    );
  }

  it("shows the empty stack and plan with no run controls or results", () => {
    render();
    expect(screen.getByTestId("testing-stack")).toBeInTheDocument();
    expect(screen.getByTestId("testing-plan")).toBeInTheDocument();
    expect(screen.queryByTestId("testing-run-all")).not.toBeInTheDocument();
    expect(screen.queryByTestId("testing-results")).not.toBeInTheDocument();
    expect(screen.getByTestId("testing-status")).toHaveAttribute(
      "data-status",
      "intake",
    );
    expect(screen.getByTestId("testing-gates")).toBeInTheDocument();
  });

  it("lists suites by kind, marks not-applicable ones, and runs one or all through the callback", () => {
    useTestStudioStore.getState().upsertSuites(projectId, PLAN);
    const onRun = vi.fn();
    render(onRun);
    expect(screen.getByTestId("testing-suite-a11y")).toBeInTheDocument();
    expect(screen.queryByTestId("testing-run-a11y")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("testing-run-unit"));
    expect(onRun).toHaveBeenCalledWith(["unit"]);
    fireEvent.click(screen.getByTestId("testing-run-all"));
    expect(onRun).toHaveBeenLastCalledWith();
    expect(screen.getByTestId("testing-plan-missing")).toHaveTextContent(
      "Integration",
    );
    // Schedule controls appear once a plan exists.
    expect(screen.getByTestId("testing-schedule-create")).toBeInTheDocument();
  });

  it("hides run buttons without a runtime instead of disabling them", () => {
    useTestStudioStore.getState().upsertSuites(projectId, PLAN);
    render(vi.fn(), false);
    expect(screen.queryByTestId("testing-run-all")).not.toBeInTheDocument();
    expect(screen.queryByTestId("testing-run-unit")).not.toBeInTheDocument();
  });

  it("renders the latest report: verdict, failures, coverage, perf, gate readings, trend and hotspots", () => {
    const store = useTestStudioStore.getState();
    store.upsertSuites(projectId, PLAN);
    store.addRun(projectId, {
      id: "r1",
      startedAt: "a",
      status: "done",
      suiteIds: ["unit", "perf"],
      triggeredBy: "agent",
      progress: {},
      report: reportFor(projectId, ["passed", "passed"]),
    });
    store.addRun(projectId, {
      id: "r2",
      startedAt: "a",
      status: "done",
      suiteIds: ["unit", "perf"],
      triggeredBy: "user",
      progress: {},
      report: reportFor(projectId, ["passed", "failed"], 900),
    });
    render();
    const results = screen.getByTestId("testing-results");
    expect(screen.getByTestId("testing-verdict")).toHaveAttribute(
      "data-verdict",
      "failed",
    );
    expect(within(results).getByTestId("testing-result-unit")).toHaveAttribute(
      "data-status",
      "failed",
    );
    expect(within(results).getByText("case 1")).toBeInTheDocument();
    expect(screen.getByTestId("testing-coverage")).toHaveTextContent("75%");
    expect(screen.getByTestId("testing-perf")).toHaveTextContent("checkout");
    expect(screen.getByTestId("testing-hotspots")).toHaveTextContent(
      "src/cart.ts",
    );
    expect(screen.getByTestId("testing-gate-p95-budget")).toHaveAttribute(
      "data-verdict",
      "failed",
    );
    expect(screen.getByTestId("testing-gate-line-coverage")).toHaveAttribute(
      "data-verdict",
      "passed",
    );
    expect(screen.getByTestId("testing-trend")).toBeInTheDocument();
    expect(screen.getByTestId("testing-sparkline-pass")).toBeInTheDocument();
    expect(screen.getByTestId("testing-run-history").children).toHaveLength(2);
  });

  it("lets the user edit a gate threshold and add a gate", () => {
    render();
    const gate = screen.getByTestId("testing-gate-p95-budget");
    const threshold = within(gate).getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(threshold, { target: { value: "250" } });
    expect(
      useTestStudioStore
        .getState()
        .projects[projectId].gates.find((g) => g.id === "p95-budget")
        ?.threshold,
    ).toBe(250);
    fireEvent.change(screen.getByTestId("testing-gate-add"), {
      target: { value: "security_total" },
    });
    expect(
      useTestStudioStore
        .getState()
        .projects[projectId].gates.some((g) => g.metric === "security_total"),
    ).toBe(true);
  });

  it("answers a choice card and posts the receipt", () => {
    const postResult = vi.fn();
    useTestStudioStore.getState().askQuestion(projectId, {
      id: "flows",
      title: "Which flows?",
      kind: "single",
      options: [
        { id: "checkout", label: "Checkout", recommended: true },
        { id: "login", label: "Login" },
      ],
      allowOther: false,
      status: "open",
      selected: [],
      at: "t",
    });
    renderWithProviders(
      <TestWorkbench
        projectId={projectId}
        postResult={postResult}
        onRun={vi.fn()}
        busy={false}
        canRun
      />,
    );
    fireEvent.click(screen.getByTestId("testing-option-flows-checkout"));
    fireEvent.click(screen.getByTestId("testing-confirm-flows"));
    expect(
      useTestStudioStore.getState().projects[projectId].questions[0].status,
    ).toBe("answered");
    expect(postResult).toHaveBeenCalledWith(
      expect.stringContaining('"question_id":"flows"'),
    );
    expect(screen.getByTestId("testing-question-flows")).toHaveAttribute(
      "data-status",
      "answered",
    );
  });

  it("shows findings and lets the user mark one fixed", () => {
    useTestStudioStore.getState().upsertFindings(projectId, [
      {
        id: "f1",
        title: "Negative discount",
        severity: "high",
        kind: "unit",
        description: "d",
        evidence: ["t"],
        status: "open",
        at: "t",
      },
    ]);
    render();
    expect(screen.getByTestId("testing-finding-f1")).toHaveAttribute(
      "data-status",
      "open",
    );
    fireEvent.click(screen.getByTestId("testing-finding-fixed-f1"));
    expect(screen.getByTestId("testing-finding-f1")).toHaveAttribute(
      "data-status",
      "fixed",
    );
  });
});
