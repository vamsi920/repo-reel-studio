import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProactiveDashboardEmpty } from "@/components/studio/agent-ops/proactive/ProactiveDashboardEmpty";
import { ProactiveCandidateDetail } from "@/components/studio/agent-ops/proactive/ProactiveCandidateDetail";
import { RunsInspectorEmpty } from "@/components/studio/agent-ops/runs/RunsInspectorEmpty";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { makeProactiveCandidate } from "@/components/studio/agent-ops/test/proactiveTestFixtures";

describe("Agent Ops empty states", () => {
  it("RunsInspectorEmpty shows run selection copy and start action", () => {
    const onStartRun = vi.fn();
    render(<RunsInspectorEmpty onStartRun={onStartRun} />);

    expect(screen.getByText(AGENT_OPS_COPY.noRunSelectedTitle)).toBeInTheDocument();
    expect(screen.getByText(AGENT_OPS_COPY.noRunSelectedMessage)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /start run/i }));
    expect(onStartRun).toHaveBeenCalledTimes(1);
  });

  it("ProactiveDashboardEmpty shows loading copy", () => {
    render(
      <ProactiveDashboardEmpty
        loading
        enabled
        attention={null}
        onEnableProactive={vi.fn()}
        onDispatch={vi.fn()}
      />,
    );

    expect(screen.getByText(AGENT_OPS_COPY.loadingCandidates)).toBeInTheDocument();
  });

  it("ProactiveDashboardEmpty shows paused copy when disabled", () => {
    render(
      <ProactiveDashboardEmpty
        loading={false}
        enabled={false}
        attention={null}
        onEnableProactive={vi.fn()}
        onDispatch={vi.fn()}
      />,
    );

    expect(screen.getByText(AGENT_OPS_COPY.proactivePausedTitle)).toBeInTheDocument();
    expect(screen.getByText(AGENT_OPS_COPY.proactivePausedMessage)).toBeInTheDocument();
  });

  it("ProactiveDashboardEmpty offers scan when enabled with no candidates", () => {
    const onDispatch = vi.fn();
    render(
      <ProactiveDashboardEmpty
        loading={false}
        enabled
        attention={null}
        onEnableProactive={vi.fn()}
        onDispatch={onDispatch}
      />,
    );

    expect(screen.getByText(AGENT_OPS_COPY.noCandidatesTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /run scan/i }));
    expect(onDispatch).toHaveBeenCalledTimes(1);
  });

  it("ProactiveCandidateDetail shows selection empty when no candidate", () => {
    render(
      <ProactiveCandidateDetail
        candidate={null}
        batch={null}
        onRefresh={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    );

    expect(screen.getByText(AGENT_OPS_COPY.noCandidateSelectedTitle)).toBeInTheDocument();
    expect(screen.getByText(AGENT_OPS_COPY.noCandidateSelectedMessage)).toBeInTheDocument();
  });

  it("ProactiveCandidateDetail renders candidate title when selected", () => {
    const candidate = makeProactiveCandidate("c1", { title: "Fix flaky test" });
    render(
      <ProactiveCandidateDetail
        candidate={candidate}
        batch={null}
        onRefresh={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    );

    expect(screen.getByText("Fix flaky test")).toBeInTheDocument();
    expect(screen.queryByText(AGENT_OPS_COPY.noCandidateSelectedTitle)).not.toBeInTheDocument();
  });
});
