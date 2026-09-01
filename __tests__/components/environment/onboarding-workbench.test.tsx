import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnboardingWorkbench } from "#/components/features/environment/studio/onboarding-workbench";
import { useOnboardingStudioStore } from "#/stores/onboarding-studio-store";

vi.mock("#/hooks/query/use-environment-profile", () => ({
  useEnvironmentProfile: () => ({ data: null }),
  useSaveEnvironmentProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("#/hooks/query/use-environment-readiness", () => ({
  useEnvironmentReadiness: () => ({
    score: 60,
    blocking: [],
    degrading: [],
    unknown: [],
    byCapability: {},
    generatedAt: "2026-08-31T00:00:00.000Z",
  }),
}));

function renderWorkbench() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OnboardingWorkbench postResult={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useOnboardingStudioStore.getState().reset();
});

describe("OnboardingWorkbench", () => {
  it("explains itself before the agent has produced anything", () => {
    renderWorkbench();
    expect(screen.getByTestId("workbench-empty")).toBeInTheDocument();
  });

  it("renders the discovery card with confidence distinguished", () => {
    const store = useOnboardingStudioStore.getState();
    store.mergeFacts([
      {
        key: "lang",
        section: "stack",
        text: "Mostly Go",
        confidence: "stated",
        at: "2026-08-31T00:00:00.000Z",
      },
      {
        key: "mono",
        section: "stack",
        text: "Probably a monorepo",
        confidence: "inferred",
        at: "2026-08-31T00:00:00.000Z",
      },
    ]);
    store.pushCard({ id: "discovery", kind: "discovery" });
    renderWorkbench();

    // The distinction has to survive to the screen, not just the store: a
    // guess shown as a stated fact is how the agent loses the user's trust.
    expect(screen.getByTestId("discovery-fact-lang")).toHaveAttribute(
      "data-confidence",
      "stated",
    );
    expect(screen.getByTestId("discovery-fact-mono")).toHaveAttribute(
      "data-confidence",
      "inferred",
    );
  });

  it("renders the plan with the current step marked", () => {
    const store = useOnboardingStudioStore.getState();
    store.setPlan(
      [
        { id: "a", title: "Connect source control", status: "done" },
        { id: "b", title: "Connect an issue tracker", status: "active" },
      ],
      "b",
    );
    store.pushCard({ id: "plan", kind: "plan" });
    renderWorkbench();

    expect(screen.getByTestId("plan-step-a")).toHaveAttribute(
      "data-status",
      "done",
    );
    expect(screen.getByTestId("plan-step-b")).toHaveAttribute(
      "data-status",
      "active",
    );
  });

  it("renders a provider picker in place instead of navigating", () => {
    useOnboardingStudioStore.getState().pushCard({
      id: "picker-1",
      kind: "picker",
      capability: "vector-store",
      providerIds: ["pinecone", "qdrant"],
    });
    renderWorkbench();

    expect(
      screen.getByTestId("workbench-picker-vector-store"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("workbench-pick-pinecone")).toBeInTheDocument();
    expect(screen.getByTestId("workbench-pick-qdrant")).toBeInTheDocument();
  });

  it("renders a connection form for the provider the agent asked about", () => {
    useOnboardingStudioStore.getState().pushCard({
      id: "form:pinecone:default",
      kind: "form",
      capability: "vector-store",
      providerId: "pinecone",
      instanceKey: "default",
      fields: "all",
      status: "open",
    });
    renderWorkbench();

    expect(
      screen.getByTestId("workbench-connection-card-pinecone"),
    ).toBeInTheDocument();
    // The manifest drives the fields, so no per-provider form component exists
    // or needs to.
    expect(screen.getByTestId("connector-field-apiKey")).toBeInTheDocument();
    expect(screen.getByTestId("connector-field-indexHost")).toBeInTheDocument();
  });
});
