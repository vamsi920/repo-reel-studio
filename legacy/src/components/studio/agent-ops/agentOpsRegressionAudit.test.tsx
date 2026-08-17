import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentOpsAttentionPanel } from "@/components/studio/agent-ops/shared/AgentOpsAttentionPanel";
import { AgentOpsOperationStrip } from "@/components/studio/agent-ops/shared/AgentOpsOperationStrip";
import { RunInspectorDetail } from "@/components/studio/agent-ops/panel/RunInspectorDetail";
import { RunInspectorFactStrip } from "@/components/studio/agent-ops/runs/RunInspectorFactStrip";
import { ProactiveCandidateCard } from "@/components/studio/agent-ops/proactive/ProactiveCandidateCard";
import { ProactiveCandidateDetail } from "@/components/studio/agent-ops/proactive/ProactiveCandidateDetail";
import { ProactiveLiveConsole } from "@/components/studio/agent-ops/proactive/ProactiveLiveConsole";
import { buildProactiveLiveGroups } from "@/components/studio/agent-ops/proactive/proactiveEventTimeline";
import { makeAgentRunFixture } from "@/components/studio/agent-ops/test/runTestFixtures";
import {
  makeProactiveCandidate,
  makeProactiveLinkedRun,
  makeProactiveStatus,
} from "@/components/studio/agent-ops/test/proactiveTestFixtures";
import { parseAgentOpsAttention } from "@/lib/agentOpsAttention";
import { getRunPhaseIndex } from "@/components/studio/agent-ops/runs/runPipeline";
import { RUN_STATUS_LABEL } from "@/components/studio/agent-ops/runs/runStatusDisplay";

describe("agentOpsRegressionAudit", () => {
  const selectedRunView = (run: ReturnType<typeof makeAgentRunFixture>) => ({
    phaseIndex: getRunPhaseIndex(run.status),
    isActive: run.status === "running",
    isReview: run.status === "awaiting_review",
    isFailed: run.status === "failed" || run.status === "cancelled",
    latestTitle: run.timeline[run.timeline.length - 1]?.title ?? null,
  });

  describe("Runs flow", () => {
    it("inspector exposes grouped tabs and review approval", () => {
      const run = makeAgentRunFixture({ status: "awaiting_review" });
      const onTabChange = vi.fn();

      render(
        <RunInspectorDetail
          run={run}
          activeTab="summary"
          onTabChange={onTabChange}
          selectedRunView={selectedRunView(run)}
          action={null}
          refreshing={false}
          approveBranch="fix/test"
          onApproveBranchChange={vi.fn()}
          onRefresh={vi.fn()}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />,
      );

      expect(screen.getByRole("tab", { name: /summary/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /checks/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /ship/i })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: /run approval/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/promotion branch/i)).toBeInTheDocument();
    });

    it("fact strip navigates to checks tab", () => {
      const run = makeAgentRunFixture();
      const onOpenTab = vi.fn();
      render(<RunInspectorFactStrip run={run} isReview={false} onOpenTab={onOpenTab} />);

      fireEvent.click(screen.getByRole("button", { name: /validation/i }));
      expect(onOpenTab).toHaveBeenCalledWith("checks");
    });

    it("checks tab renders validation section", () => {
      const run = makeAgentRunFixture({
        artifacts: {
          ...makeAgentRunFixture().artifacts,
          validation: { overallStatus: "passed", commands: [] },
        },
      });

      render(
        <RunInspectorDetail
          run={run}
          activeTab="checks"
          onTabChange={vi.fn()}
          selectedRunView={selectedRunView(run)}
          action={null}
          refreshing={false}
          approveBranch=""
          onApproveBranchChange={vi.fn()}
          onRefresh={vi.fn()}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
          onApprove={vi.fn()}
          onReject={vi.fn()}
        />,
      );

      expect(document.getElementById("run-checks-validation-heading")).toBeInTheDocument();
    });
  });

  describe("Proactive flow", () => {
    it("candidate card shows approve for review_ready", () => {
      const onApprove = vi.fn();
      render(
        <ProactiveCandidateCard
          candidate={makeProactiveCandidate("c1", { status: "review_ready" })}
          tabIndex={0}
          selectedRunId={null}
          selectedCandidateId={null}
          action={null}
          onApprove={onApprove}
          onDismiss={vi.fn()}
          onSelectRun={vi.fn()}
          onSelectCandidate={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /approve/i }));
      expect(onApprove).toHaveBeenCalled();
    });

    it("detail surfaces policy block and validation on checks tab", () => {
      const candidate = makeProactiveCandidate("c1", {
        policyStatus: "blocked",
        policySummary: "Secrets in diff",
        linkedRun: makeProactiveLinkedRun({
          status: "awaiting_review",
          validation: { overallStatus: "failed", commands: [], notes: [] },
          issueTitle: "Fix leak",
        }),
      });

      render(
        <ProactiveCandidateDetail
          candidate={candidate}
          batch={null}
          onSelectRun={vi.fn()}
          onRefresh={vi.fn()}
        />,
      );

      expect(screen.getByText(/secrets in diff/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("tab", { name: /checks/i }));
      expect(document.getElementById("proactive-checks-validation")).toBeInTheDocument();
    });

    it("live console renders grouped events", () => {
      const candidate = makeProactiveCandidate("c1", {
        timeline: [
          {
            at: "2026-05-27T12:00:00.000Z",
            stage: "scan",
            title: "Scan started",
            detail: null,
          },
        ],
      });
      const groups = buildProactiveLiveGroups(candidate, makeProactiveStatus().batch);
      expect(groups.length).toBeGreaterThan(0);

      render(<ProactiveLiveConsole candidate={candidate} batch={makeProactiveStatus().batch} />);
      expect(screen.getByText(/scan started/i)).toBeInTheDocument();
    });
  });

  describe("Backend error states", () => {
    it("renders agent attention panel", () => {
      render(
        <AgentOpsAttentionPanel
          attention={parseAgentOpsAttention("Ingestion API unavailable", "agent")}
        />,
      );
      expect(screen.getByText(/cannot reach the ingestion api/i)).toBeInTheDocument();
    });

    it("operation strip stays idle during background sync flags", () => {
      render(<AgentOpsOperationStrip operation={null} />);
      expect(screen.getByText("Idle", { selector: ".sr-only" })).toBeInTheDocument();
    });
  });

  describe("Run status display", () => {
    it("still labels awaiting_review for queue rows", () => {
      expect(RUN_STATUS_LABEL.awaiting_review).toBe("Awaiting review");
    });
  });
});
