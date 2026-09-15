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
  React.useEffect(() => {
    if (!closeOnEscape) return undefined;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeOnEscape, onClose]);

  // Focus management for `role="dialog" aria-modal="true"`: move keyboard
  // focus into the dialog on open, keep Tab / Shift+Tab cycling inside it,
  // and hand focus back to whatever opened it on close. Without this a
  // keyboard or screen-reader user tabs through the page hidden behind the
  // backdrop. The Tab handler is a native listener on the dialog node (not a
  // React prop) so a stacked modal, which portals to a sibling node, does not
  // receive the outer modal's key events through React-tree bubbling.
  const dialogRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

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
