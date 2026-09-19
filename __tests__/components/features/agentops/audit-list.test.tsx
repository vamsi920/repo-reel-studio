import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuditList } from "#/components/features/agentops/audit-list";
import type { AgentOpsAuditRecord } from "#/api/agentops-service/agentops-service.types";

function record(
  overrides: Partial<AgentOpsAuditRecord>,
): AgentOpsAuditRecord {
  return {
    id: "audit-1",
    at: "2026-01-01T00:00:00.000Z",
    actor: "user",
    action: "run.pause",
    summary: "Run paused from the Control Tower",
    entityType: "run",
    entityId: "run-1",
    ...overrides,
  };
}

describe("AuditList", () => {
  // Regression: run-control.mjs records a user-initiated Pause as "run.pause"
  // (present tense), distinct from the collector's own budget-halt
  // "run.paused" — the same user/system split "run.cancel" vs. "run.cancelled"
  // already has entries for. Only "run.paused" was mapped, so a user's own
  // Pause fell back to the generic Flag icon and default grey tone instead of
  // the Pause icon and warning tone every other pause gets.
  it("gives a user-initiated pause the same treatment as a collector-initiated one", () => {
    const { container: userPause } = render(
      <AuditList audit={[record({ action: "run.pause" })]} emptyMessage="" />,
    );
    const { container: systemPause } = render(
      <AuditList
        audit={[record({ action: "run.paused" })]}
        emptyMessage=""
      />,
    );

    const userIcon = userPause.querySelector("li > span")!;
    const systemIcon = systemPause.querySelector("li > span")!;
    expect(userIcon.getAttribute("style")).toBe(
      systemIcon.getAttribute("style"),
    );
    expect(userIcon.innerHTML).toBe(systemIcon.innerHTML);
  });

  it("renders a record's summary and action", () => {
    render(<AuditList audit={[record({})]} emptyMessage="" />);
    expect(screen.getByText("Run paused from the Control Tower")).toBeInTheDocument();
    expect(screen.getByText(/run\.pause/)).toBeInTheDocument();
  });
});
