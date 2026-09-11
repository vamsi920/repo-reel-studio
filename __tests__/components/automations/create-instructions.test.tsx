import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NavigationProvider,
  type NavigationContextValue,
} from "#/context/navigation-context";
import { CreateInstructions } from "#/components/features/automations/create-instructions";
import { I18nKey } from "#/i18n/declaration";
import { useConversationStore } from "#/stores/conversation-store";
import * as telemetry from "#/services/telemetry";

const mockCreateConversationMutate = vi.fn();

vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => ({ data: { user_consents_to_analytics: true } }),
}));

vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: () => ({
    mutate: mockCreateConversationMutate,
    isPending: false,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        [I18nKey.AUTOMATIONS$CREATE_AUTOMATION_BUTTON]: "Create Automation",
        [I18nKey.AUTOMATIONS$CREATE_AUTOMATION_PROMPT]: "Create an automation",
        [I18nKey.AUTOMATIONS$CREATE_INSTRUCTIONS_GUIDANCE]:
          "Include what the automation should do, when it should run, and where to send the results.",
      };
      return translations[key] || key;
    },
  }),
  Trans: ({
    i18nKey,
    components,
  }: {
    i18nKey: string;
    components?: Record<string, React.ReactElement>;
  }) => {
    if (i18nKey !== I18nKey.AUTOMATIONS$EMPTY_OPTION_CONVERSATION_DESC) {
      return i18nKey;
    }

    return (
      <>
        Start a new conversation and tell OpenHands to{" "}
        {components?.example
          ? React.cloneElement(
              components.example,
              {},
              <>
                {components.cmd
                  ? React.cloneElement(
                      components.cmd,
                      {},
                      "Create an automation",
                    )
                  : null}
                {components.punct
                  ? React.cloneElement(components.punct, {}, ".")
                  : null}
              </>,
            )
          : null}
      </>
    );
  },
}));

function renderCreateInstructions() {
  const value: NavigationContextValue = {
    currentPath: "/automations",
    conversationId: null,
    isNavigating: false,
    navigate: vi.fn(),
  };

  const result = render(
    <NavigationProvider value={value}>
      <CreateInstructions />
    </NavigationProvider>,
  );

  return { ...result, navigate: value.navigate };
}

describe("CreateInstructions", () => {
  let captureMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureMock = vi
      .spyOn(telemetry, "trackEvent")
      .mockResolvedValue(undefined);
    useConversationStore.setState({ messageToSend: null });
    mockCreateConversationMutate.mockReset();
  });

  afterEach(() => {
    captureMock.mockRestore();
  });

  it("captures automation_created_button with the active backend kind when Create Automation is clicked", async () => {
    const user = userEvent.setup();
    renderCreateInstructions();

    await user.click(screen.getByTestId("automations-create-automation"));

    expect(captureMock).toHaveBeenCalledWith(
      "automation_created_button",
      expect.objectContaining({ backend_kind: "local" }),
    );
  });

  it("creates a fresh conversation and navigates there with a prefilled prompt when Create Automation is clicked", async () => {
    const user = userEvent.setup();
    const setMessageToSend = vi.fn();
    useConversationStore.setState({ setMessageToSend });
    const { navigate } = renderCreateInstructions();

    await user.click(screen.getByTestId("automations-create-automation"));

    expect(mockCreateConversationMutate).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    const onSuccess = mockCreateConversationMutate.mock.calls[0][1]
      .onSuccess as (conversation: {
      conversation_id: string;
      task_id?: string;
    }) => void;
    onSuccess({ conversation_id: "convo-456" });

    expect(navigate).toHaveBeenCalledWith("/conversations/convo-456");
    await waitFor(() => {
      expect(setMessageToSend).toHaveBeenCalledWith("Create an automation");
    });
  });
});
