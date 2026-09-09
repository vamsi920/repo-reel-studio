import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EnvironmentRequirementsScreen from "#/routes/environment-requirements";
import {
  computeReadiness,
  EMPTY_EVIDENCE,
  type ReadinessEvidence,
} from "#/lib/environment/requirements/readiness";
import { createEmptyProfile } from "#/lib/environment/types/profile";
import type { ProbeResult } from "#/lib/environment/types/probe";
import type { ReadinessReport } from "#/lib/environment/types/requirements";

const NOW = "2026-09-09T00:00:00.000Z";

const state = vi.hoisted(() => ({
  readiness: null as unknown,
  seeds: [] as string[],
}));

vi.mock("#/hooks/query/use-environment-profile", () => ({
  useEnvironmentProfile: () => ({ data: null }),
}));

vi.mock("#/hooks/query/use-environment-readiness", () => ({
  useEnvironmentReadiness: () => state.readiness,
}));

vi.mock("#/stores/onboarding-copilot-store", () => ({
  useOnboardingCopilotStore: (
    selector: (store: { openWithSeed: (prompt: string) => void }) => unknown,
  ) =>
    selector({
      openWithSeed: (prompt: string) => {
        state.seeds.push(prompt);
      },
    }),
}));

function probe(ok: boolean): ProbeResult {
  return { ok, vantage: "edge", latencyMs: 1, checks: [], probedAt: NOW };
}

function report(evidence: ReadinessEvidence): ReadinessReport {
  return computeReadiness(evidence, null, NOW);
}

beforeEach(() => {
  state.readiness = report(EMPTY_EVIDENCE);
  state.seeds = [];
});

describe("Environment requirements", () => {
  it("says a feature has not been checked instead of calling it ready", () => {
    // Nothing has been probed, so every requirement is `unknown`. Reporting
    // those features as green told people a deployment was ready when no
    // check had run at all.
    render(<EnvironmentRequirementsScreen />);
    const feature = screen.getByTestId("requirement-feature-automations.run");
    expect(feature).toHaveAttribute("data-status", "unknown");
    for (const row of within(feature).getAllByTestId(
      "requirement-row-automations.run",
    )) {
      expect(row).toHaveAttribute("data-status", "unknown");
    }
  });

  it("shows an unsatisfied optional requirement as unsatisfied", () => {
    // `optional` items are in none of the blocking/degrading/unknown buckets,
    // so reading those buckets rendered a failed optional check as satisfied.
    state.readiness = report({
      probes: { "egress:us.i.posthog.com:443": probe(false) },
      capabilities: {},
    });
    render(<EnvironmentRequirementsScreen />);
    const feature = screen.getByTestId("requirement-feature-telemetry");
    expect(feature).toHaveAttribute("data-status", "degraded");
    expect(
      within(feature).getByTestId("requirement-row-telemetry"),
    ).toHaveAttribute("data-status", "unsatisfied");
  });

  it("calls a feature ready only once every requirement is satisfied", () => {
    state.readiness = report({
      probes: { "egress:us.i.posthog.com:443": probe(true) },
      capabilities: {},
    });
    render(<EnvironmentRequirementsScreen />);
    expect(screen.getByTestId("requirement-feature-telemetry")).toHaveAttribute(
      "data-status",
      "ready",
    );
  });

  it("marks a feature blocked and offers the fix to the agent", async () => {
    state.readiness = report({
      probes: {},
      capabilities: { "source-control": "missing" },
    });
    render(<EnvironmentRequirementsScreen />);
    const feature = screen.getByTestId(
      "requirement-feature-repositories.browse",
    );
    expect(feature).toHaveAttribute("data-status", "blocked");

    await userEvent.click(
      within(feature).getByTestId("requirement-fix-repositories.browse"),
    );
    expect(state.seeds).toHaveLength(1);
  });

  it("does not put a not-applicable requirement on the checklist as passing", () => {
    const profile = createEmptyProfile("org", NOW);
    profile.mode = "saas";
    state.readiness = computeReadiness(EMPTY_EVIDENCE, profile, NOW);
    render(<EnvironmentRequirementsScreen />);
    const rows = screen.getAllByTestId("requirement-row-agentops.persistence");
    for (const row of rows) {
      expect(row).not.toHaveAttribute("data-status", "satisfied");
    }
  });
});
