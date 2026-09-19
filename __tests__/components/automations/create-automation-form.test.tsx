import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavigationProvider } from "#/context/navigation-context";
import { CreateAutomationForm } from "#/components/features/automations/create-automation-form";
import { I18nKey } from "#/i18n/declaration";

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
}));

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NavigationProvider
        value={{
          currentPath: "/automations",
          conversationId: null,
          isNavigating: false,
          navigate: vi.fn(),
        }}
      >
        <CreateAutomationForm onCreated={vi.fn()} onCancel={vi.fn()} />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

describe("CreateAutomationForm validation errors", () => {
  it("clears the name error as soon as a non-empty value is typed", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByTestId("create-automation-submit"));
    expect(
      screen.getByText(I18nKey.AUTOMATIONS$CREATE_NAME_REQUIRED),
    ).toBeInTheDocument();

    await user.type(screen.getByTestId("create-automation-name"), "My Automation");

    expect(
      screen.queryByText(I18nKey.AUTOMATIONS$CREATE_NAME_REQUIRED),
    ).not.toBeInTheDocument();
  });

  it("clears the instructions error as soon as a non-empty value is typed", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByTestId("create-automation-submit"));
    expect(
      screen.getByText(I18nKey.AUTOMATIONS$CREATE_INSTRUCTIONS_REQUIRED),
    ).toBeInTheDocument();

    await user.type(
      screen.getByTestId("create-automation-prompt"),
      "Do the thing",
    );

    expect(
      screen.queryByText(I18nKey.AUTOMATIONS$CREATE_INSTRUCTIONS_REQUIRED),
    ).not.toBeInTheDocument();
  });
});
