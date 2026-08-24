import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  NavigationProvider,
  type NavigationContextValue,
} from "#/context/navigation-context";
import { AddAutomationModal } from "#/components/features/automations/add-automation-modal";
import { I18nKey } from "#/i18n/declaration";

vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => ({ data: { user_consents_to_analytics: true } }),
}));

vi.mock("#/hooks/query/use-llm-profiles", () => ({
  useLlmProfiles: () => ({ data: { profiles: [] }, isLoading: false }),
}));

vi.mock("#/hooks/query/use-manifest-capabilities", () => ({
  useDeploymentCapabilities: () => ({ data: undefined }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  Trans: ({
    i18nKey,
    components,
    children,
  }: {
    i18nKey: string;
    components?: Record<string, React.ReactElement>;
    children?: React.ReactNode;
  }) => {
    if (i18nKey !== I18nKey.AUTOMATIONS$EMPTY_OPTION_CONVERSATION_DESC) {
      return children ?? i18nKey;
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

function renderModal(isOpen = true) {
  const onClose = vi.fn();
  const navigation: NavigationContextValue = {
    currentPath: "/automations",
    conversationId: null,
    isNavigating: false,
    navigate: vi.fn(),
  };

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <NavigationProvider value={navigation}>
        <AddAutomationModal isOpen={isOpen} onClose={onClose} />
      </NavigationProvider>
    </QueryClientProvider>,
  );

  return { onClose };
}

describe("AddAutomationModal", () => {
  it("opens on the create form rather than an explainer", () => {
    // The modal used to only explain how to ask an agent to build an
    // automation, which made "Add Automation" a dead end.
    renderModal();

    expect(screen.getByTestId("add-automation-modal")).toBeInTheDocument();
    expect(screen.getByTestId("create-automation-form")).toBeInTheDocument();
    expect(screen.getByTestId("create-automation-submit")).toBeInTheDocument();
    expect(
      screen.queryByTestId("automations-create-instructions-example"),
    ).not.toBeInTheDocument();
  });

  it("still offers the conversation route from the form", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId("add-automation-use-chat"));

    expect(
      screen.getByTestId("automations-create-instructions-example"),
    ).toHaveTextContent("Create an automation");
    expect(
      screen.getByTestId("automations-create-automation"),
    ).toHaveTextContent(I18nKey.AUTOMATIONS$CREATE_AUTOMATION_BUTTON);
  });

  it("does not render when closed", () => {
    renderModal(false);

    expect(
      screen.queryByTestId("add-automation-modal"),
    ).not.toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByTestId("add-automation-modal-close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
