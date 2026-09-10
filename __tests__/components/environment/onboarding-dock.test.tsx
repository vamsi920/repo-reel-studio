import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { OnboardingDock } from "#/components/features/environment/copilot/onboarding-dock";
import { useOnboardingCopilotStore } from "#/stores/onboarding-copilot-store";

vi.mock("#/hooks/query/use-onboarding-session", () => ({
  useOnboardingSession: () => ({ data: null }),
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
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OnboardingDock />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OnboardingDock", () => {
  it("hides itself on the studio route", () => {
    renderDock("/environment/setup");
    expect(screen.queryByTestId("onboarding-dock-trigger")).toBeNull();
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
});
