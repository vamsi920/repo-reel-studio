import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EnvironmentOverviewScreen from "#/routes/environment-overview";
import { createEmptyProfile } from "#/lib/environment/types/profile";
import type { ReadinessReport } from "#/lib/environment/types/requirements";

const state = vi.hoisted(() => ({
  supabaseConfigured: true,
  readiness: null as ReadinessReport | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return state.supabaseConfigured;
  },
  supabase: null,
}));

vi.mock("#/hooks/query/use-environment-profile", () => ({
  useEnvironmentProfile: () => ({
    data: createEmptyProfile("org-1", "2026-08-30T00:00:00.000Z"),
  }),
}));

vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => ({ data: [] }),
}));

vi.mock("#/hooks/query/use-environment-readiness", () => ({
  useEnvironmentReadiness: () => state.readiness,
}));

function baseReport(overrides: Partial<ReadinessReport> = {}): ReadinessReport {
  return {
    score: 55,
    blocking: [],
    degrading: [],
    unknown: [],
    byCapability: { "source-control": "ok", llm: "missing" },
    generatedAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EnvironmentOverviewScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.supabaseConfigured = true;
  state.readiness = baseReport();
});

describe("Environment overview", () => {
  it("renders a tile for every capability the product can use", () => {
    renderScreen();
    const grid = screen.getByTestId("capability-grid");
    // One per capability, so an unconfigured capability is visibly absent
    // rather than simply not mentioned.
    expect(within(grid).getAllByRole("link")).toHaveLength(11);
    expect(screen.getByTestId("capability-tile-source-control")).toHaveAttribute(
      "data-status",
      "ok",
    );
    expect(screen.getByTestId("capability-tile-llm")).toHaveAttribute(
      "data-status",
      "missing",
    );
  });

  it("falls back to 'not checked' for a capability with no evidence", () => {
    renderScreen();
    expect(screen.getByTestId("capability-tile-secrets")).toHaveAttribute(
      "data-status",
      "unknown",
    );
  });

  it("separates blocking, degrading and unchecked into their own panels", () => {
    state.readiness = baseReport({
      blocking: [
        {
          id: "a",
          featureId: "conversation.start",
          featureNameKey: "REQUIREMENT$FEATURE_CONVERSATION_START",
          node: { kind: "env-pair", id: "session-key-drift" },
          severity: "blocking",
          status: "unsatisfied",
        },
      ],
      degrading: [
        {
          id: "b",
          featureId: "memory.vector-search",
          featureNameKey: "REQUIREMENT$FEATURE_MEMORY_SEARCH",
          node: { kind: "pg-extension", name: "vector" },
          severity: "degrading",
          status: "unsatisfied",
          degradesToKey: "REQUIREMENT$DEGRADE_MEMORY_SEARCH",
        },
      ],
    });
    renderScreen();

    expect(
      within(screen.getByTestId("environment-blocking")).getByText(
        "VITE_SESSION_API_KEY = LOCAL_BACKEND_API_KEY",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("environment-degrading")).getByText(
        "extension vector",
      ),
    ).toBeInTheDocument();
  });

  it("offers to hand a blocking item to the agent", () => {
    state.readiness = baseReport({
      blocking: [
        {
          id: "a",
          featureId: "conversation.start",
          featureNameKey: "REQUIREMENT$FEATURE_CONVERSATION_START",
          node: { kind: "egress", host: "api.github.com", port: 443 },
          severity: "blocking",
          status: "unsatisfied",
        },
      ],
    });
    renderScreen();
    expect(screen.getByTestId("fix-with-agent-a")).toBeInTheDocument();
  });

  it("explains itself instead of rendering an empty board without Supabase", () => {
    state.supabaseConfigured = false;
    renderScreen();
    expect(
      screen.getByTestId("environment-overview-unconfigured"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("capability-grid")).not.toBeInTheDocument();
  });
});
