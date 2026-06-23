import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { AgentOpsShell } from "@/components/studio/agent-ops/AgentOpsShell";
import { PrimaryWorkspaceStatus } from "@/components/studio/agent-ops/PrimaryWorkspaceStatus";
import { WorkspaceModeSwitch } from "@/components/studio/agent-ops/WorkspaceModeSwitch";
import { ProactiveCandidateCard } from "@/components/studio/agent-ops/proactive/ProactiveCandidateCard";
import { ProactiveCandidateDetail } from "@/components/studio/agent-ops/proactive/ProactiveCandidateDetail";
import { ProactiveCandidateFactStrip } from "@/components/studio/agent-ops/proactive/ProactiveCandidateFactStrip";
import { ProactiveCandidateGrid } from "@/components/studio/agent-ops/proactive/ProactiveCandidateGrid";
import { ProactiveDashboardHeader } from "@/components/studio/agent-ops/proactive/ProactiveDashboardHeader";
import { ProactiveInspectorTabBar } from "@/components/studio/agent-ops/proactive/ProactiveInspectorTabBar";
import { RunInspectorFactStrip } from "@/components/studio/agent-ops/runs/RunInspectorFactStrip";
import { RunInspectorTabBar } from "@/components/studio/agent-ops/runs/RunInspectorTabBar";
import { IssueRunComposer } from "@/components/studio/agent-ops/runs/IssueRunComposer";
import { makeProactiveCandidate, makeProactiveStatus } from "@/components/studio/agent-ops/test/proactiveTestFixtures";
import { makeAgentRunFixture } from "@/components/studio/agent-ops/test/runTestFixtures";
import {
  AGENT_OPS_FINAL_QA_WIDTHS,
  AGENT_OPS_RESPONSIVE_VIEWPORTS,
  agentOpsRootClass,
} from "@/components/studio/agent-ops/shared/agentOpsLayout";

function renderAtWidth(ui: ReactElement, width: number) {
  const { container } = render(
    <div className={agentOpsRootClass} style={{ width, maxWidth: width }}>
      {ui}
    </div>,
  );
  const shell = container.firstElementChild as HTMLElement;
  expect(shell.scrollWidth - shell.clientWidth).toBeLessThanOrEqual(1);
  return { container, shell };
}

describe("agentOpsResponsiveLayout", () => {
  it("documents pass 35 and pass 38 QA widths", () => {
    expect(AGENT_OPS_RESPONSIVE_VIEWPORTS).toEqual({ mobile: 390, tablet: 768, desktop: 1280 });
    expect(AGENT_OPS_FINAL_QA_WIDTHS).toEqual([320, 390, 768, 1024, 1440]);
  });

  describe.each(AGENT_OPS_FINAL_QA_WIDTHS)("final QA at %ipx", (width) => {
    it("ProactiveCandidateCard", () => {
      renderAtWidth(
        <ProactiveCandidateCard
          candidate={makeProactiveCandidate("c1", {
            title: "Long candidate title for narrow viewport overflow checks",
            status: "review_ready",
          })}
          tabIndex={0}
          selectedRunId={null}
          selectedCandidateId={null}
          action={null}
          onApprove={() => {}}
          onDismiss={() => {}}
          onSelectRun={() => {}}
          onSelectCandidate={() => {}}
        />,
        width,
      );
    });

    it("ProactiveCandidateGrid", () => {
      renderAtWidth(
        <ProactiveCandidateGrid
          candidates={[makeProactiveCandidate("c1"), makeProactiveCandidate("c2")]}
          selectedCandidateId="c1"
          onSelectCandidate={() => {}}
          renderCandidateCard={(candidate, tabIndex) => (
            <ProactiveCandidateCard
              key={candidate.id}
              candidate={candidate}
              tabIndex={tabIndex}
              selectedRunId={null}
              selectedCandidateId="c1"
              action={null}
              onApprove={() => {}}
              onDismiss={() => {}}
              onSelectRun={() => {}}
              onSelectCandidate={() => {}}
            />
          )}
        />,
        width,
      );
    });

    it("AgentOpsShell", () => {
      renderAtWidth(
        <AgentOpsShell
          workspaceTab="runs"
          onWorkspaceTabChange={() => {}}
          activeRunCount={2}
          pendingReview={1}
          proactiveReadyCount={3}
          proactiveTarget={6}
          operation={{ label: "Approving run…", tone: "mutate" }}
        >
          <p className="text-sm text-white/60">Lane body</p>
        </AgentOpsShell>,
        width,
      );
    });

    it("WorkspaceModeSwitch + PrimaryWorkspaceStatus", () => {
      renderAtWidth(
        <div className="space-y-3">
          <WorkspaceModeSwitch
            value="runs"
            onChange={() => {}}
            pendingReview={2}
            activeRunCount={1}
            proactiveReadyCount={0}
          />
          <PrimaryWorkspaceStatus
            workspaceTab="runs"
            activeRunCount={1}
            pendingReview={2}
            proactiveReadyCount={0}
            proactiveTarget={6}
          />
        </div>,
        width,
      );
    });

    it("RunInspectorTabBar", () => {
      renderAtWidth(<RunInspectorTabBar activeTab="checks" onTabChange={() => {}} />, width);
    });

    it("ProactiveInspectorTabBar", () => {
      renderAtWidth(<ProactiveInspectorTabBar activeTab="checks" onTabChange={() => {}} />, width);
    });

    it("IssueRunComposer", () => {
      renderAtWidth(
        <IssueRunComposer
          issueUrl="https://github.com/org/repo/issues/99999"
          branch="feature/very-long-branch-name-for-layout"
          submitting={false}
          error={null}
          agentBackendAttention={null}
          isGitHub
          runCount={4}
          pendingReview={2}
          inputRef={{ current: null }}
          onIssueUrlChange={() => {}}
          onBranchChange={() => {}}
          onStartRun={() => {}}
        />,
        width,
      );
    });

    it("ProactiveDashboardHeader", () => {
      renderAtWidth(
        <ProactiveDashboardHeader
          status={makeProactiveStatus({ ready: 2, target: 6 })}
          loading={false}
          syncing={false}
          action={null}
          attention={null}
          onRefresh={() => {}}
          onDispatch={() => {}}
        />,
        width,
      );
    });

    it("RunInspectorFactStrip", () => {
      const run = makeAgentRunFixture();
      renderAtWidth(
        <RunInspectorFactStrip run={run} isReview={run.status === "awaiting_review"} onOpenTab={() => {}} />,
        width,
      );
    });

    it("ProactiveCandidateFactStrip", () => {
      renderAtWidth(
        <ProactiveCandidateFactStrip candidate={makeProactiveCandidate("c1")} onOpenTab={() => {}} />,
        width,
      );
    });

    it("ProactiveCandidateDetail", () => {
      renderAtWidth(
        <ProactiveCandidateDetail
          candidate={makeProactiveCandidate("c1", { status: "review_ready" })}
          batch={makeProactiveStatus().batch}
          onSelectRun={() => {}}
          onRefresh={() => {}}
        />,
        width,
      );
    });
  });
});
