import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AutomationHealthBadge } from "#/components/features/automations/automation-health-badge";
import type { InterfaceListInsights } from "#/manifests/types";

const labels: InterfaceListInsights["health"] = {
  healthy: "Healthy",
  failing: "Failing",
  running: "Running",
  disabled: "Disabled",
  neverRun: "Never run",
  checking: "Checking…",
};

describe("AutomationHealthBadge", () => {
  it("renders the manifest's caption for each health state", () => {
    render(<AutomationHealthBadge health="healthy" labels={labels} />);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("maps the never-run state to its neverRun caption", () => {
    render(<AutomationHealthBadge health="never-run" labels={labels} />);
    expect(screen.getByText("Never run")).toBeInTheDocument();
  });

  it("maps the unknown state to the checking caption", () => {
    render(<AutomationHealthBadge health="unknown" labels={labels} />);
    expect(screen.getByText("Checking…")).toBeInTheDocument();
  });

  it("exposes a stable testid for callers to target", () => {
    render(<AutomationHealthBadge health="failing" labels={labels} />);
    expect(screen.getByTestId("automation-health-badge")).toBeInTheDocument();
  });
});
