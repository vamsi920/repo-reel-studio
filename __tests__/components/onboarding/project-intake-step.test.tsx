import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ProjectIntakeStep } from "#/components/features/onboarding/steps/project-intake-step";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const navigateMock = vi.fn();
vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({ navigate: navigateMock }),
}));

const createConversationMock = vi.fn();
vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: () => ({
    mutate: createConversationMock,
    isPending: false,
    isSuccess: false,
  }),
}));

vi.mock("#/hooks/use-is-creating-conversation", () => ({
  useIsCreatingConversation: () => false,
}));

const useLlmConfiguredMock = vi.fn();
vi.mock("#/hooks/use-llm-configured", () => ({
  useLlmConfigured: () => useLlmConfiguredMock(),
}));

describe("ProjectIntakeStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks submit and shows the LLM-not-configured banner when no LLM is set up", async () => {
    useLlmConfiguredMock.mockReturnValue({
      isConfigured: false,
      isLoading: false,
    });
    const user = userEvent.setup();

    render(<ProjectIntakeStep onLaunched={vi.fn()} />);
    await user.type(
      screen.getByTestId("onboarding-project-input"),
      "a todo app",
    );

    expect(screen.getByTestId("onboarding-project-submit")).toBeDisabled();
    expect(
      screen.getByTestId("home-llm-not-configured-banner"),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId("onboarding-project-submit"));
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it("does not block submit while the LLM-configured check is still loading", () => {
    useLlmConfiguredMock.mockReturnValue({
      isConfigured: false,
      isLoading: true,
    });

    render(<ProjectIntakeStep onLaunched={vi.fn()} />);

    expect(
      screen.queryByTestId("home-llm-not-configured-banner"),
    ).not.toBeInTheDocument();
  });

  it("allows submit once an LLM is configured", async () => {
    useLlmConfiguredMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
    });
    const user = userEvent.setup();

    render(<ProjectIntakeStep onLaunched={vi.fn()} />);
    await user.type(
      screen.getByTestId("onboarding-project-input"),
      "a todo app",
    );
    await user.click(screen.getByTestId("onboarding-project-submit"));

    expect(
      screen.queryByTestId("home-llm-not-configured-banner"),
    ).not.toBeInTheDocument();
    expect(createConversationMock).toHaveBeenCalledTimes(1);
  });
});
