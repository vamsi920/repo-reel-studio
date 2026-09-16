import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageInput } from "#/components/features/settings/app-settings/language-input";

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/components/features/settings/settings-dropdown-input", () => ({
  SettingsDropdownInput: ({
    testId,
    onInputChange,
  }: {
    testId: string;
    onInputChange: (value: string) => void;
  }) => (
    <input
      data-testid={testId}
      onChange={(event) => onInputChange(event.target.value)}
    />
  ),
}));

describe("LanguageInput", () => {
  it("shows no layout note for a left-to-right language", () => {
    render(
      <LanguageInput
        name="language-input"
        onChange={vi.fn()}
        defaultKey="ja"
      />,
    );
    expect(screen.queryByTestId("language-input-rtl-note")).toBeNull();
  });

  it("explains the left-to-right layout when the saved language is Arabic", () => {
    render(
      <LanguageInput
        name="language-input"
        onChange={vi.fn()}
        defaultKey="ar"
      />,
    );
    expect(screen.getByTestId("language-input-rtl-note")).toHaveTextContent(
      "SETTINGS$LANGUAGE_RTL_NOTE",
    );
  });

  it("toggles the note as the user picks a language", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LanguageInput
        name="language-input"
        onChange={onChange}
        defaultKey="en"
      />,
    );

    const input = screen.getByTestId("language-input");
    await user.clear(input);
    await user.type(input, "Arabic");
    expect(screen.getByTestId("language-input-rtl-note")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith("Arabic");

    await user.clear(input);
    await user.type(input, "Deutsch");
    expect(screen.queryByTestId("language-input-rtl-note")).toBeNull();
  });
});
