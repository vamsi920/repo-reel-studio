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
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";

const NOW = "2026-09-09T00:00:00.000Z";

const state = vi.hoisted(() => ({
  readiness: null as unknown,
  seeds: [] as string[],
  connections: [] as ConnectionRecord[],
}));

vi.mock("#/hooks/query/use-environment-profile", () => ({
  useEnvironmentProfile: () => ({ data: null }),
}));

vi.mock("#/hooks/query/use-environment-readiness", () => ({
  useEnvironmentReadiness: () => state.readiness,
}));

vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => ({ data: state.connections }),
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

function connectionRecord(
  overrides: Partial<ConnectionRecord>,
): ConnectionRecord {
  return {
    id: "conn-1",
    orgId: "org-1",
    capability: "source-control",
    providerId: "github",
    instanceKey: "default",
    displayName: null,
    config: {},
    redactedSummary: {},
    requestedScopes: [],
    grantedScopes: [],
    status: "ok",
    lastProbe: null,
    lastProbeAt: null,
    expiresAt: null,
    createdBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  state.readiness = report(EMPTY_EVIDENCE);
  state.seeds = [];
  state.connections = [];
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
      /^requirement-row-automations\.run-/,
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
      within(feature).getByTestId(/^requirement-row-telemetry-/),
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
      within(feature).getByTestId(/^requirement-fix-repositories\.browse-/),
    );
    expect(state.seeds).toHaveLength(1);
  });

  it("folds the already-known connection diagnosis into the fix-with-agent seed", async () => {
    // Same regression as the Overview tab's matching CTA: the seed used to
    // carry only the requirement label, forcing the agent to ask what the
    // page already knows (provider, account, missing scopes).
    state.readiness = report({
      probes: {},
      capabilities: { "source-control": "missing" },
    });
    state.connections = [
      connectionRecord({
        providerId: "github",
        displayName: "vamsi920",
        status: "error",
        requestedScopes: ["read:user", "repo"],
        grantedScopes: [],
      }),
    ];
    render(<EnvironmentRequirementsScreen />);
    const feature = screen.getByTestId(
      "requirement-feature-repositories.browse",
    );

    await userEvent.click(
      within(feature).getByTestId(/^requirement-fix-repositories\.browse-/),
    );

    expect(state.seeds).toHaveLength(1);
    expect(state.seeds[0]).toContain("CONNECTOR$GITHUB_NAME");
    expect(state.seeds[0]).toContain("vamsi920");
    expect(state.seeds[0]).toContain("read:user, repo");
  });

  it("gives each unsatisfied requirement row and fix button its own test id when a feature has more than one failing requirement", () => {
    // `requirement-row-<featureId>`/`requirement-fix-<featureId>` used to be
    // keyed only by featureId, not by the individual requirement node. Any
    // feature with two-or-more simultaneously unsatisfied requirements (like
    // repositories.browse: a missing source-control capability AND a missing
    // GITHUB_TOKEN_ENCRYPTION_KEY env var) rendered two elements sharing the
    // same test id, so a scoped `getByTestId` query would have thrown a
    // "Found multiple elements" error instead of resolving.
    state.readiness = report({
      probes: {
        "env:supabase-edge:GITHUB_TOKEN_ENCRYPTION_KEY": probe(false),
      },
      capabilities: { "source-control": "missing" },
    });
    render(<EnvironmentRequirementsScreen />);
    const feature = screen.getByTestId(
      "requirement-feature-repositories.browse",
    );

    const rows = within(feature).getAllByTestId(
      /^requirement-row-repositories\.browse-/,
    );
    expect(rows).toHaveLength(2);
    // Every row's test id is unique -- no two share the same value.
    expect(new Set(rows.map((row) => row.getAttribute("data-testid"))).size).toBe(
      2,
    );

    const fixButtons = within(feature).getAllByTestId(
      /^requirement-fix-repositories\.browse-/,
    );
    expect(fixButtons).toHaveLength(2);
    expect(
      new Set(fixButtons.map((button) => button.getAttribute("data-testid")))
        .size,
    ).toBe(2);
  });

  it("does not put a not-applicable requirement on the checklist as passing", () => {
    const profile = createEmptyProfile("org", NOW);
    profile.mode = "saas";
    state.readiness = computeReadiness(EMPTY_EVIDENCE, profile, NOW);
    render(<EnvironmentRequirementsScreen />);
    const rows = screen.getAllByTestId(
      /^requirement-row-agentops\.persistence-/,
    );
    for (const row of rows) {
      expect(row).not.toHaveAttribute("data-status", "satisfied");
    }
  });
});
