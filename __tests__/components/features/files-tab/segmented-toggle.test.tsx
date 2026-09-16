import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";

import { SegmentedToggle } from "#/components/features/files-tab/segmented-toggle";

type Mode = "rich" | "plain" | "raw";

const OPTIONS = [
  { value: "rich" as const, label: "Rich" },
  { value: "plain" as const, label: "Plain" },
  { value: "raw" as const, label: "Raw" },
];

// Stateful wrapper so a keyboard move re-renders with the new checked option,
// the way the route does through its store.
function Harness({
  initial = "rich",
  onChange,
}: {
  initial?: Mode;
  onChange?: (value: Mode) => void;
}) {
  const [value, setValue] = useState<Mode>(initial);
  return (
    <SegmentedToggle<Mode>
      ariaLabel="Content mode"
      testId="toggle"
      value={value}
      options={OPTIONS}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
}

// The toggles follow the WAI-ARIA radio-group pattern: one tab stop (the
// checked option), arrow keys move the check and focus to a sibling.
describe("SegmentedToggle", () => {
  it("names the group and keeps only the checked option in the tab order", () => {
    // Arrange + Act
    render(<Harness />);

    // Assert
    expect(
      screen.getByRole("radiogroup", { name: "Content mode" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Rich" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("radio", { name: "Plain" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(screen.getByRole("radio", { name: "Raw" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("moves the check and focus with ArrowRight / ArrowLeft, wrapping at the ends", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const rich = screen.getByRole("radio", { name: "Rich" });
    rich.focus();

    // Act: right from the first option.
    await user.keyboard("{ArrowRight}");

    // Assert
    expect(onChange).toHaveBeenLastCalledWith("plain");
    const plain = screen.getByRole("radio", { name: "Plain" });
    expect(plain).toHaveFocus();
    expect(plain).toHaveAttribute("aria-checked", "true");
    expect(plain).toHaveAttribute("tabindex", "0");
    expect(rich).toHaveAttribute("aria-checked", "false");
    expect(rich).toHaveAttribute("tabindex", "-1");

    // Act: left twice wraps from the first option to the last.
    await user.keyboard("{ArrowLeft}{ArrowLeft}");

    // Assert
    expect(onChange).toHaveBeenLastCalledWith("raw");
    expect(screen.getByRole("radio", { name: "Raw" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Raw" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("treats ArrowDown / ArrowUp like ArrowRight / ArrowLeft and supports Home / End", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial="plain" />);
    screen.getByRole("radio", { name: "Plain" }).focus();

    // Act + Assert
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Raw" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Raw" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("radio", { name: "Plain" })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: "Rich" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Rich" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "Raw" })).toHaveFocus();
  });

  it("ignores unrelated keys and still selects on click", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    screen.getByRole("radio", { name: "Rich" }).focus();

    // Act
    await user.keyboard("{Tab}");

    // Assert: Tab leaves the group instead of moving to a sibling option.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Plain" })).not.toHaveFocus();

    // Act
    await user.click(screen.getByRole("radio", { name: "Raw" }));

    // Assert
    expect(onChange).toHaveBeenLastCalledWith("raw");
    expect(screen.getByRole("radio", { name: "Raw" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
