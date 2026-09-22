import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DeleteConfirmationModal } from "#/components/features/automations/delete-confirmation-modal";

// Previously this modal rendered its own backdrop/close markup instead of
// the shared `ModalBackdrop`: its Escape handler lived on a plain
// `role="presentation"` div that sits beside the dialog content in the DOM,
// not above it, so a keydown bubbling up from a focused control inside the
// dialog never reached it — Escape did nothing — and neither Tab-trapping
// nor initial focus were wired up at all. These tests exercise the dialog
// through `ModalBackdrop` the same way a keyboard user would.
describe("DeleteConfirmationModal", () => {
  it("closes on Escape while focus is inside the dialog", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <DeleteConfirmationModal
        automationName="Nightly sync"
        isOpen
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    // Focus starts inside the dialog (moved there on open); Escape from here
    // used to be swallowed because the old handler lived on a DOM sibling.
    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("traps Tab focus inside the dialog", async () => {
    const user = userEvent.setup();
    render(
      <DeleteConfirmationModal
        automationName="Nightly sync"
        isOpen
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const cancelButton = screen.getByRole("button", {
      name: "AUTOMATIONS$CANCEL",
    });
    const deleteButton = screen.getByRole("button", {
      name: "AUTOMATIONS$DELETE",
    });

    // Tabbing past the last control must wrap back inside the dialog, never
    // escape to whatever renders behind it.
    deleteButton.focus();
    await user.tab();
    expect(deleteButton).not.toHaveFocus();
    expect(
      [screen.getByRole("button", { name: "BUTTON$CLOSE" }), cancelButton].some(
        (el) => el === document.activeElement,
      ),
    ).toBe(true);
  });

  it("calls onConfirm when Delete is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DeleteConfirmationModal
        automationName="Nightly sync"
        isOpen
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "AUTOMATIONS$DELETE" }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    render(
      <DeleteConfirmationModal
        automationName="Nightly sync"
        isOpen={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
