import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BugFixerConnectors } from "#/components/features/automations/bug-fixer-connectors";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({ backend: { kind: "local" } }),
}));

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({ trackAutomationCreatedButton: vi.fn() }),
}));

vi.mock("#/hooks/query/use-automations", () => ({
  useImportAutomation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("#/components/shared/modals/modal-backdrop", () => ({
  ModalBackdrop: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("#/components/shared/modals/modal-close-button", () => ({
  // eslint-disable-next-line i18next/no-literal-string
  ModalCloseButton: () => <button type="button">close</button>,
}));

describe("BugFixerConnectors", () => {
  it("warns upfront that the GitHub trigger has no backend receiver yet", async () => {
    const user = userEvent.setup();
    render(<BugFixerConnectors />);

    await user.click(screen.getByTestId("bug-fixer-connect-github"));

    expect(
      screen.getByTestId("bug-fixer-unsupported-trigger-warning"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("AUTOMATIONS$UNSUPPORTED_TRIGGER_WARNING"),
    ).toBeInTheDocument();
  });

  it("does not show the warning for the Jira connector", async () => {
    const user = userEvent.setup();
    render(<BugFixerConnectors />);

    await user.click(screen.getByTestId("bug-fixer-connect-jira"));

    expect(
      screen.queryByTestId("bug-fixer-unsupported-trigger-warning"),
    ).not.toBeInTheDocument();
  });
});
