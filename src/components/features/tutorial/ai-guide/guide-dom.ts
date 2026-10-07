import type { AiGuideStepKind } from "./ai-guide-store";

/** Time for the page to react (open a panel, render) after the user acts. */
export const SETTLE_AFTER_ACTION_MS = 700;
/** Longest wait for a link click to actually change the page. */
const MAX_NAVIGATION_WAIT_MS = 3000;
const NAVIGATION_POLL_MS = 100;

/** Smallest box we will spotlight; smaller is usually a hidden duplicate. */
const MIN_TARGET_PX = 4;

export function waitFor(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

/** The in-app path a link would open, if clicking `element` navigates. */
export function linkTargetPath(element: HTMLElement): string | null {
  const anchor = element.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  return url.pathname === window.location.pathname ? null : url.pathname;
}

/**
 * Lets the page catch up before the agent reads it again. A link to another
 * page can take a moment (lazy routes), and reading too early makes the
 * agent see the old page and repeat itself, so wait for the URL to change
 * first, then for the new page to render.
 */
export async function settleAfterAction(
  pathBefore: string,
  expectsNavigation: boolean,
  signal: AbortSignal,
) {
  if (expectsNavigation) {
    // Measured by the clock, not by counting polls: browsers slow timers in
    // background tabs (to once a second or even once a minute), and a
    // poll-count budget then stretched a 3-second wait into minutes.
    const deadline = Date.now() + MAX_NAVIGATION_WAIT_MS;
    while (window.location.pathname === pathBefore && Date.now() < deadline) {
      await waitFor(NAVIGATION_POLL_MS, signal);
    }
  }
  await waitFor(SETTLE_AFTER_ACTION_MS, signal);
}

/**
 * Marks the step done as soon as the user does the thing it points at: a
 * click inside `element`, or (for a field) a change or leaving it. Listens in
 * the capture phase and never blocks the event, so the app reacts normally.
 */
export function completeOnUserAction(
  element: HTMLElement,
  kind: AiGuideStepKind,
  advance: () => void,
) {
  const events = kind === "type" ? ["change", "focusout"] : ["click"];
  const onEvent = (event: Event) => {
    if (event.target instanceof Node && element.contains(event.target)) {
      advance();
    }
  };
  for (const name of events) document.addEventListener(name, onEvent, true);
  return () => {
    for (const name of events) {
      document.removeEventListener(name, onEvent, true);
    }
  };
}

/** Laid out, shown and not transparent: something a user could click. */
export function isVisibleTarget(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width < MIN_TARGET_PX || rect.height < MIN_TARGET_PX) return false;
  const style = window.getComputedStyle(element);
  return (
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    Number(style.opacity) !== 0
  );
}
