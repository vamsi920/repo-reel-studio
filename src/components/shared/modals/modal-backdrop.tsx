import React from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

// The dialog that most recently held focus. When Escape lands on <body>
// (focus fell out because the focused control was removed or disabled) this
// is the dialog that closes, so stacked modals never close together.
let lastFocusedDialog: HTMLElement | null = null;

interface ModalBackdropProps {
  children: React.ReactNode;
  onClose?: () => void;
  /** When false, pressing Escape does not close the modal. Defaults to true. */
  closeOnEscape?: boolean;
  /** When false, clicking the backdrop does not close the modal. Defaults to true. */
  closeOnBackdropClick?: boolean;
  /** When true, renders above the default modal layer so it stacks over other
   *  modals (used by the telemetry consent banner over the onboarding modal).
   *  Defaults to false. */
  elevated?: boolean;
  "aria-label"?: string;
}

export function ModalBackdrop({
  children,
  onClose,
  closeOnEscape = true,
  closeOnBackdropClick = true,
  elevated = false,
  "aria-label": ariaLabel,
}: ModalBackdropProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Escape closes the dialog. Two listeners, because a single window-level
  // one broke both stacked modals and react-aria widgets:
  //  - a capture-phase listener on the dialog node handles Escape pressed on
  //    a control inside *this* dialog. Capture runs before the control's own
  //    React handler, so a HeroUI/react-aria combobox that stops propagation
  //    of Escape can no longer hide the key from us. A stacked child modal
  //    portals to a sibling node, so its keys never reach this listener and
  //    a child that opted out with closeOnEscape={false} keeps its parent
  //    open too. An open popover (combobox listbox, menu) owns its Escape:
  //    let it close first, the next press reaches the dialog.
  //  - a bubble-phase window listener only covers Escape pressed while focus
  //    sits outside every dialog (e.g. on <body> after a focused control was
  //    removed), and only for the dialog that last held focus, so stacked
  //    modals never close together. Bubble phase keeps respecting a widget
  //    that stopped propagation, exactly as before.
  React.useEffect(() => {
    if (!closeOnEscape) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const isOwnedByOpenPopover = (target: Element) =>
      target.closest(
        '[role="combobox"][aria-expanded="true"],[aria-haspopup][aria-expanded="true"]',
      ) !== null;

    const handleEscapeInside = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target instanceof Element ? e.target : null;
      if (target && isOwnedByOpenPopover(target)) return;
      onClose?.();
    };

    const handleEscapeOutside = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[role="dialog"]')) return;
      if (lastFocusedDialog !== dialog) return;
      onClose?.();
    };

    dialog.addEventListener("keydown", handleEscapeInside, true);
    window.addEventListener("keydown", handleEscapeOutside);
    return () => {
      dialog.removeEventListener("keydown", handleEscapeInside, true);
      window.removeEventListener("keydown", handleEscapeOutside);
    };
  }, [closeOnEscape, onClose]);

  // Focus management for `role="dialog" aria-modal="true"`: move keyboard
  // focus into the dialog on open, keep Tab / Shift+Tab cycling inside it,
  // and hand focus back to whatever opened it on close. Without this a
  // keyboard or screen-reader user tabs through the page hidden behind the
  // backdrop. The Tab handler is a native listener on the dialog node (not a
  // React prop) so a stacked modal, which portals to a sibling node, does not
  // receive the outer modal's key events through React-tree bubbling.
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const handleFocusIn = () => {
      lastFocusedDialog = dialog;
    };
    dialog.addEventListener("focusin", handleFocusIn);

    // Children's effects run first, so respect a control they already focused.
    if (!dialog.contains(document.activeElement)) {
      const [first] = getFocusableElements(dialog);
      (first ?? dialog).focus();
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first || !dialog.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !dialog.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener("keydown", handleTab);
    return () => {
      dialog.removeEventListener("keydown", handleTab);
      dialog.removeEventListener("focusin", handleFocusIn);
      if (lastFocusedDialog === dialog) lastFocusedDialog = null;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdropClick) return;
    if (e.target === e.currentTarget) onClose?.(); // only close if the click was on the backdrop
  };

  if (typeof document === "undefined") return null;

  // Portal to document.body so the modal's `position: fixed` resolves
  // against the viewport. Otherwise a transformed ancestor (e.g. the
  // onboarding slide rail) would become the containing block and the
  // modal would render trapped inside it instead of overlapping its
  // parent modal.
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={-1}
      className={`fixed inset-0 flex items-center justify-center outline-none ${
        elevated ? "z-[70]" : "z-60"
      }`}
    >
      <div
        onClick={handleClick}
        className="fixed inset-0 bg-black opacity-60"
      />
      <div className="relative">{children}</div>
    </div>,
    document.body,
  );
}
