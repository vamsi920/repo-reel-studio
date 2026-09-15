import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";

function OpenerWithModal() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open modal
      </button>
      <button type="button">next on page</button>
      {open ? (
        <ModalBackdrop onClose={() => setOpen(false)}>
          <button type="button">first in dialog</button>
          <button type="button">last in dialog</button>
        </ModalBackdrop>
      ) : null}
    </>
  );
}

describe("ModalBackdrop", () => {
  it("moves focus into the dialog on open and returns it to the opener on close", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<OpenerWithModal />);
    const opener = screen.getByRole("button", { name: "open modal" });

    // Act: open from the keyboard, then dismiss with Escape.
    await user.click(opener);
    const firstInDialog = screen.getByRole("button", {
      name: "first in dialog",
    });
    const focusedOnOpen = document.activeElement;
    await user.keyboard("{Escape}");

    // Assert
    expect(focusedOnOpen).toBe(firstInDialog);
    expect(opener).toHaveFocus();
  });

  it("keeps Tab and Shift+Tab cycling inside the dialog instead of reaching the page behind it", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<OpenerWithModal />);
    await user.click(screen.getByRole("button", { name: "open modal" }));
    const first = screen.getByRole("button", { name: "first in dialog" });
    const last = screen.getByRole("button", { name: "last in dialog" });

    // Act + Assert: Tab past the last control wraps to the first, and
    // Shift+Tab from the first wraps to the last — never "next on page".
    await user.tab();
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("portals out of a transformed ancestor so position: fixed resolves against the viewport", () => {
    // Arrange: a transformed ancestor would otherwise become the
    // containing block for `position: fixed` descendants and trap the
    // modal inside it (the OnboardingModal / InstallServerModal bug).
    render(
      <div
        data-testid="transformed-ancestor"
        style={{ transform: "translateX(0)" }}
      >
        <ModalBackdrop onClose={vi.fn()}>
          <p>modal content</p>
        </ModalBackdrop>
      </div>,
    );

    // Act
    const dialog = screen.getByRole("dialog");
    const transformedAncestor = screen.getByTestId("transformed-ancestor");

    // Assert
    expect(transformedAncestor.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("calls onClose when the user presses Escape", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ModalBackdrop onClose={onClose}>
        <p>modal content</p>
      </ModalBackdrop>,
    );

    // Act
    await user.keyboard("{Escape}");

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked but not when the content is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ModalBackdrop onClose={onClose}>
        <button type="button">inside content</button>
      </ModalBackdrop>,
    );

    // Act: click the content first — this must NOT close.
    await user.click(screen.getByRole("button", { name: "inside content" }));
    const callsAfterContentClick = onClose.mock.calls.length;

    // Act: now click the backdrop overlay (the dialog root's backdrop child).
    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.firstElementChild as HTMLElement;
    await user.click(backdrop);

    // Assert
    expect(callsAfterContentClick).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the backdrop is clicked and closeOnBackdropClick is false", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ModalBackdrop onClose={onClose} closeOnBackdropClick={false}>
        <button type="button">inside content</button>
      </ModalBackdrop>,
    );

    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.firstElementChild as HTMLElement;
    await user.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("stacks above the default modal layer when elevated", () => {
    // Arrange: a default backdrop (the layer the onboarding modal uses) and an
    // elevated backdrop (the layer the telemetry consent banner opts into).
    render(
      <>
        <ModalBackdrop aria-label="default-modal">
          <p>default modal</p>
        </ModalBackdrop>
        <ModalBackdrop elevated aria-label="elevated-modal">
          <p>elevated modal</p>
        </ModalBackdrop>
      </>,
    );

    // Act: read the numeric stacking layer each modal renders on. jsdom cannot
    // compute paint order, so compare the z-index the overlay carries.
    const layerOf = (name: string) =>
      Number(
        screen
          .getByRole("dialog", { name })
          .className.match(/z-\[?(\d+)\]?/)?.[1] ?? 0,
      );

    // Assert: the elevated modal paints above the default one regardless of
    // mount order, so the consent banner is never covered by the onboarding modal.
    expect(layerOf("elevated-modal")).toBeGreaterThan(layerOf("default-modal"));
  });
});
