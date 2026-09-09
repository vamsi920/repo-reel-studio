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

  it("says why the launch failed instead of silently resetting", async () => {
    // This is the first screen a new user ever sees; a failed launch used to
    // re-enable the button and say nothing at all, which reads as the product
    // being broken rather than something to retry.
    useLlmConfiguredMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
    });
    createConversationMock.mockImplementationOnce(
      (_variables: unknown, handlers: { onError: (error: Error) => void }) => {
        handlers.onError(new Error("agent server unreachable"));
      },
    );
    const onLaunched = vi.fn();
    const user = userEvent.setup();

    render(<ProjectIntakeStep onLaunched={onLaunched} />);
    await user.type(
      screen.getByTestId("onboarding-project-input"),
      "a todo app",
    );
    await user.click(screen.getByTestId("onboarding-project-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "agent server unreachable",
    );
    expect(onLaunched).not.toHaveBeenCalled();
    // The brief the user typed survives, so retrying costs nothing.
    expect(screen.getByTestId("onboarding-project-input")).toHaveValue(
      "a todo app",
    );
  });

  it("clears a previous failure when the user retries", async () => {
    useLlmConfiguredMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
    });
    createConversationMock.mockImplementationOnce(
      (_variables: unknown, handlers: { onError: (error: Error) => void }) => {
        handlers.onError(new Error("agent server unreachable"));
      },
    );
    createConversationMock.mockImplementationOnce(
      (
        _variables: unknown,
        handlers: { onSuccess: (data: { conversation_id: string }) => void },
      ) => {
        handlers.onSuccess({ conversation_id: "conv-1" });
      },
    );
    const user = userEvent.setup();

    render(<ProjectIntakeStep onLaunched={vi.fn()} />);
    await user.type(
      screen.getByTestId("onboarding-project-input"),
      "a todo app",
    );
    await user.click(screen.getByTestId("onboarding-project-submit"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByTestId("onboarding-project-submit"));

    expect(createConversationMock).toHaveBeenCalledTimes(2);
    expect(navigateMock).toHaveBeenCalledWith("/conversations/conv-1");
    expect(
      screen.queryByTestId("onboarding-project-error"),
    ).not.toBeInTheDocument();
  });
});
