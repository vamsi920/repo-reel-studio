import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PrimaryWorkspaceStatus } from "@/components/studio/agent-ops/PrimaryWorkspaceStatus";
import { ProactiveCandidateGrid } from "@/components/studio/agent-ops/proactive/ProactiveCandidateGrid";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { runStatusLabel } from "@/components/studio/agent-ops/runs/runStatusDisplay";
import { WorkspaceModeSwitch } from "@/components/studio/agent-ops/WorkspaceModeSwitch";
import { makeProactiveCandidate } from "@/components/studio/agent-ops/test/proactiveTestFixtures";

describe("Agent Ops workspace UI", () => {
  it("runStatusLabel covers review and active run states", () => {
    expect(runStatusLabel("awaiting_review")).toBe("Awaiting review");
    expect(runStatusLabel("running", "short")).toBe("Running");
  });

  it("WorkspaceModeSwitch shows proactive ready count", () => {
    render(
      <WorkspaceModeSwitch
        value="proactive"
        onChange={vi.fn()}
        pendingReview={0}
        activeRunCount={2}
        proactiveReadyCount={4}
      />,
    );

    const proactiveTab = screen.getByRole("tab", { name: /proactive/i });
    expect(proactiveTab).toHaveAttribute("aria-selected", "true");
    expect(proactiveTab).toHaveTextContent("4");
  });

  it("PrimaryWorkspaceStatus reflects ready count updates on proactive tab", () => {
    const { rerender } = render(
      <PrimaryWorkspaceStatus
        workspaceTab="proactive"
        activeRunCount={0}
        pendingReview={0}
        proactiveReadyCount={0}
        proactiveTarget={6}
      />,
    );

    expect(screen.getByText(AGENT_OPS_COPY.noCandidatesReady)).toBeInTheDocument();

    rerender(
      <PrimaryWorkspaceStatus
        workspaceTab="proactive"
        activeRunCount={0}
        pendingReview={0}
        proactiveReadyCount={3}
        proactiveTarget={6}
      />,
    );

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(AGENT_OPS_COPY.candidatesReady)).toBeInTheDocument();
    expect(screen.getByText("/6")).toBeInTheDocument();
  });

  it("ProactiveCandidateGrid advances selection with arrow keys", () => {
    const onSelectCandidate = vi.fn();
    const candidates = [makeProactiveCandidate("c1"), makeProactiveCandidate("c2")];

    render(
      <ProactiveCandidateGrid
        candidates={candidates}
        selectedCandidateId="c1"
        onSelectCandidate={onSelectCandidate}
        renderCandidateCard={(candidate, tabIndex) => (
          <button type="button" role="radio" aria-checked={candidate.id === "c1"} tabIndex={tabIndex}>
            {candidate.title}
          </button>
        )}
      />,
    );

    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(onSelectCandidate).toHaveBeenCalledWith("c2");
  });
});
