import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";

describe("SettingsSwitch", () => {
  it("should call the onChange handler when the input is clicked", async () => {
    const user = userEvent.setup();
    const onToggleMock = vi.fn();
    render(
      <SettingsSwitch testId="test-switch" onToggle={onToggleMock}>
        Test Switch
      </SettingsSwitch>,
    );

    const switchInput = screen.getByTestId("test-switch");

    await user.click(switchInput);
    expect(onToggleMock).toHaveBeenCalledWith(true);

    await user.click(switchInput);
    expect(onToggleMock).toHaveBeenCalledWith(false);
  });

  it("should render a beta tag if isBeta is true", () => {
    const { rerender } = render(
      <SettingsSwitch testId="test-switch" onToggle={vi.fn()} isBeta={false}>
        Test Switch
      </SettingsSwitch>,
    );

    expect(screen.queryByText(/beta/i)).not.toBeInTheDocument();

    rerender(
      <SettingsSwitch testId="test-switch" onToggle={vi.fn()} isBeta>
        Test Switch
      </SettingsSwitch>,
    );

    expect(screen.getByText(/beta/i)).toBeInTheDocument();
  });

  it("should be able to set a default toggle state", async () => {
    const user = userEvent.setup();
    const onToggleMock = vi.fn();
    render(
      <SettingsSwitch
        testId="test-switch"
        onToggle={onToggleMock}
        defaultIsToggled
      >
        Test Switch
      </SettingsSwitch>,
    );

    expect(screen.getByTestId("test-switch")).toBeChecked();

    const switchInput = screen.getByTestId("test-switch");
    await user.click(switchInput);
    expect(onToggleMock).toHaveBeenCalledWith(false);

    expect(screen.getByTestId("test-switch")).not.toBeChecked();
  });

  it("should resync to a changed defaultIsToggled prop (e.g. a background settings refetch)", () => {
    const { rerender } = render(
      <SettingsSwitch
        testId="test-switch"
        onToggle={vi.fn()}
        defaultIsToggled={false}
      >
        Test Switch
      </SettingsSwitch>,
    );

    expect(screen.getByTestId("test-switch")).not.toBeChecked();

    rerender(
      <SettingsSwitch testId="test-switch" onToggle={vi.fn()} defaultIsToggled>
        Test Switch
      </SettingsSwitch>,
    );

    expect(screen.getByTestId("test-switch")).toBeChecked();
  });

  it("should not clobber an in-progress unsaved toggle when defaultIsToggled changes under it (e.g. an unrelated settings refetch)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SettingsSwitch
        testId="test-switch"
        onToggle={vi.fn()}
        defaultIsToggled={false}
      >
        Test Switch
      </SettingsSwitch>,
    );

    // User flips it on, but hasn't saved yet.
    await user.click(screen.getByTestId("test-switch"));
    expect(screen.getByTestId("test-switch")).toBeChecked();

    // An unrelated settings refetch lands while the edit is still
    // unsaved (e.g. `defaultIsToggled` momentarily agreeing with the
    // user's own pick is not itself proof the guard works)...
    rerender(
      <SettingsSwitch testId="test-switch" onToggle={vi.fn()} defaultIsToggled>
        Test Switch
      </SettingsSwitch>,
    );
    expect(screen.getByTestId("test-switch")).toBeChecked();

    // ...and then a further refetch reports the value is actually back to
    // its original, unrelated state. Without a touched guard this would
    // silently snap the switch back off, discarding the user's still-unsaved
    // choice.
    rerender(
      <SettingsSwitch
        testId="test-switch"
        onToggle={vi.fn()}
        defaultIsToggled={false}
      >
        Test Switch
      </SettingsSwitch>,
    );
    expect(screen.getByTestId("test-switch")).toBeChecked();
  });
});
