import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnboardingDock } from "#/components/features/environment/copilot/onboarding-dock";
import { useOnboardingCopilotStore } from "#/stores/onboarding-copilot-store";

let mockSessionData: { conversationId: string } | null = {
  conversationId: "conv-1",
};

vi.mock("#/hooks/query/use-onboarding-session", () => ({
  useOnboardingSession: () => ({ data: mockSessionData }),
}));

vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => ({ data: [] }),
}));

vi.mock("#/api/environment-service/environment-service.api", async () => {
  const actual = await vi.importActual<
    typeof import("#/api/environment-service/environment-service.api")
  >("#/api/environment-service/environment-service.api");
  return {
    ...actual,
    EnvironmentService: { setCredentials: vi.fn() },
  };
});

function renderDock(path = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <OnboardingDock />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionData = { conversationId: "conv-1" };
});

describe("OnboardingDock", () => {
  it("hides itself on the studio route", () => {
    renderDock("/environment/setup");
    expect(screen.queryByTestId("onboarding-dock-trigger")).toBeNull();
  });

  it("does not hide itself on a route that merely contains the studio path as a substring", () => {
    // A prefix/substring check would also hide the dock -- credential-request
    // indicator included -- on any future sibling route like this one.
    renderDock("/environment/setup-history");
    expect(screen.getByTestId("onboarding-dock-trigger")).toBeInTheDocument();
  });

  it("flags a pending credential request on the trigger", () => {
    act(() => {
      useOnboardingCopilotStore.getState().requestCredentials({
        requestId: "linear:default",
        capability: "issue-tracker",
        providerId: "linear",
        instanceKey: "default",
        fields: ["apiKey"],
      });
    });
    renderDock();
    expect(screen.getByTestId("onboarding-dock")).toBeInTheDocument();
    expect(screen.getByTestId("credential-request-sheet")).toBeInTheDocument();
  });

  it("does not carry a half-typed secret over into the next request", async () => {
    // The sheet keeps what was typed in local state. A second request for a
    // different provider re-used the same mounted sheet, so Linear's key sat
    // pre-filled in Anthropic's `apiKey` field, one click from being sent to
    // the wrong service.
    const user = userEvent.setup();
    act(() => {
      useOnboardingCopilotStore.getState().requestCredentials({
        requestId: "linear:default",
        capability: "issue-tracker",
        providerId: "linear",
        instanceKey: "default",
        fields: ["apiKey"],
      });
    });
    renderDock();

    await user.type(
      screen.getByTestId("connector-field-apiKey"),
      "lin_api_abc123",
    );
    expect(screen.getByTestId("connector-field-apiKey")).toHaveValue(
      "lin_api_abc123",
    );

    act(() => {
      useOnboardingCopilotStore.getState().requestCredentials({
        requestId: "anthropic:default",
        capability: "llm",
        providerId: "anthropic",
        instanceKey: "default",
        fields: ["apiKey"],
      });
    });

    expect(screen.getByText("CONNECTOR$ANTHROPIC_NAME")).toBeInTheDocument();
    expect(screen.getByTestId("connector-field-apiKey")).toHaveValue("");
  });

  it("does not render the credential sheet before the onboarding session has resolved a conversation id", () => {
    // `postResult` becomes a no-op `() => undefined` whenever
    // `useOnboardingSession()` has no `conversationId` yet (still loading, or
    // the org lookup behind it hasn't settled). Rendering the sheet anyway
    // let the user submit a credential that was saved on the server but
    // never reported back to the agent -- the tool call that raised the
    // request just hung forever with no visible sign anything went wrong.
    mockSessionData = null;
    act(() => {
      useOnboardingCopilotStore.getState().requestCredentials({
        requestId: "linear:default",
        capability: "issue-tracker",
        providerId: "linear",
        instanceKey: "default",
        fields: ["apiKey"],
      });
    });
    renderDock();

    expect(screen.getByTestId("onboarding-dock")).toBeInTheDocument();
    expect(
      screen.queryByTestId("credential-request-sheet"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("onboarding-dock-session-unavailable"),
    ).toBeInTheDocument();
  });
});
