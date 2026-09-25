import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildAutomationMetadataPills } from "#/components/features/automations/build-automation-pills";
import type { Automation } from "#/types/automation";

const baseAutomation: Automation = {
  id: "automation-1",
  name: "Async Standup Digest",
  enabled: true,
  trigger: { type: "cron", schedule: "0 9 * * *" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  prompt: null,
};

function renderPills(automation: Automation, scheduleLabel: string) {
  const pills = buildAutomationMetadataPills(automation, scheduleLabel);
  render(<>{pills.map((pill) => <div key={pill.id}>{pill.node}</div>)}</>);
  return pills;
}

describe("buildAutomationMetadataPills", () => {
  it("omits the repository pill when the automation has none", () => {
    const pills = renderPills(baseAutomation, "Daily");
    expect(pills.find((p) => p.id === "repository")).toBeUndefined();
  });

  it("renders a repository pill when the automation targets one", () => {
    renderPills({ ...baseAutomation, repository: "org/repo" }, "Daily");
    expect(screen.getByText("org/repo")).toBeInTheDocument();
  });

  it("renders a schedule pill using the given label for a non-event trigger", () => {
    const pills = renderPills(baseAutomation, "Weekdays at 9am");
    expect(pills.find((p) => p.id === "schedule")).toBeDefined();
    expect(pills.find((p) => p.id === "event-trigger")).toBeUndefined();
    expect(screen.getByText("Weekdays at 9am")).toBeInTheDocument();
  });

  it("renders an event pill instead of a schedule pill for an event trigger", () => {
    const automation: Automation = {
      ...baseAutomation,
      trigger: { type: "event", source: "github", on: "pull_request.opened" },
    };
    const pills = renderPills(automation, "Daily");
    expect(pills.find((p) => p.id === "event-trigger")).toBeDefined();
    expect(pills.find((p) => p.id === "schedule")).toBeUndefined();
    expect(screen.getByText("pull_request.opened (github)")).toBeInTheDocument();
  });

  it("omits the model pill when the automation has none, and renders it when present", () => {
    const withoutModel = buildAutomationMetadataPills(baseAutomation, "Daily");
    expect(withoutModel.find((p) => p.id === "model")).toBeUndefined();

    const pills = renderPills(
      { ...baseAutomation, model: "claude-sonnet-5" },
      "Daily",
    );
    expect(pills.find((p) => p.id === "model")).toBeDefined();
    expect(screen.getByText("claude-sonnet-5")).toBeInTheDocument();
  });
});
