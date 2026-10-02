import React from "react";

/** Breathing room between the anchor's edges and the spotlight ring. */
const SPOTLIGHT_PADDING_PX = 4;
/** Lazy UI may mount a few frames after navigation; keep looking briefly. */
const ANCHOR_LOOKUP_FRAMES = 30;

export interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface AnchorMatch {
  element: HTMLElement;
  /** Index of the matching testId within the caller's priority-ordered list. */
  index: number;
}

/**
 * Returns the first candidate in `testIds` (in priority order) that is
 * actually laid out on screen, along with its index. Hidden variants (for
 * example the desktop sidebar on a phone) report an empty rect and are
 * skipped.
 */
function findTutorialAnchorMatch(
  testIds: readonly string[],
  root: ParentNode = document,
): AnchorMatch | null {
  for (let index = 0; index < testIds.length; index += 1) {
    const candidates = root.querySelectorAll<HTMLElement>(
      `[data-testid="${CSS.escape(testIds[index])}"]`,
    );
    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return { element, index };
    }
  }
  return null;
}

/**
 * Returns the first element matching one of `testIds` (in order) that is
 * actually laid out on screen, or `null`. Hidden variants (for example the
 * desktop sidebar on a phone) report an empty rect and are skipped.
 */
export function findTutorialAnchor(
  testIds: readonly string[],
  root: ParentNode = document,
): HTMLElement | null {
  return findTutorialAnchorMatch(testIds, root)?.element ?? null;
}

function toSpotlightRect(element: HTMLElement): SpotlightRect {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top - SPOTLIGHT_PADDING_PX,
    left: rect.left - SPOTLIGHT_PADDING_PX,
    width: rect.width + SPOTLIGHT_PADDING_PX * 2,
    height: rect.height + SPOTLIGHT_PADDING_PX * 2,
  };
}

/**
 * Viewport rect (padded) of the first on-screen element in `anchorTestIds`,
 * kept current as the element, window or any scroll container moves. `null`
 * while nothing matching is on screen. Lazy UI may mount a few frames after
 * the step navigates, so the lookup keeps retrying briefly.
 */
export function useTutorialAnchorRect({
  anchorTestIds,
  remeasureKey,
}: {
  anchorTestIds?: readonly string[];
  /**
   * Bump this (e.g. with the mobile nav drawer's open/closed state) to force
   * a fresh `findTutorialAnchor` search rather than just re-measuring the
   * anchor already found. Needed because a user can dismiss the mobile
   * drawer out from under a routed step (backdrop tap, its own close
   * button) independent of the tour: the previously-found anchor gets
   * unmounted, and neither a window resize/scroll nor its own
   * ResizeObserver fires for an element that's gone, so without this the
   * ring would stay frozen at the anchor's last position instead of
   * falling back to the next candidate in `anchorTestIds` (typically the
   * mobile menu toggle).
   */
  remeasureKey?: unknown;
}): SpotlightRect | null {
  const [rect, setRect] = React.useState<SpotlightRect | null>(null);
  const anchorKey = anchorTestIds?.join("|") ?? "";

  React.useEffect(() => {
    setRect(null);
    if (!anchorTestIds?.length) return undefined;

    let anchor: HTMLElement | null = null;
    let everUpgraded = false;
    let frame = 0;
    let framesLeft = ANCHOR_LOOKUP_FRAMES;

    const measure = () => {
      if (anchor?.isConnected) setRect(toSpotlightRect(anchor));
    };

    // Tracks the anchor's own box, not just the viewport: a sidebar collapse
    // toggle (or any other layout shift that resizes the row itself without
    // firing a window `resize` event) would otherwise leave the ring stuck at
    // a stale rect until the next scroll/resize/step change.
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);

    // A lower-priority candidate (the mobile menu toggle) can be on screen
    // before a higher-priority one (the real sidebar link) finishes
    // mounting: opening the mobile drawer for the first routed step after a
    // non-routed one is a mount-then-CSS-transition two-step in Sidebar.tsx,
    // so the real link can exist with a nonzero rect (mount) well before its
    // slide-in transform settles. Settling for whatever is found on the
    // very first frame would either (a) permanently miss a real anchor that
    // mounts a beat later, spotlighting the fallback forever, or (b) lock
    // onto the real anchor's stale mid-transition position the instant it
    // mounts. So: keep polling every frame — upgrading to a higher-priority
    // match as soon as it appears, and continuing to re-measure for the rest
    // of the budget once an upgrade happens (there's no transitionend hook
    // here; riding out the remaining frames is what catches the transform
    // settling) — and only stop early when the top-priority candidate was
    // already the very first thing found, matching the common, no-drawer
    // case exactly as before.
    const settle = () => {
      const match = findTutorialAnchorMatch(anchorTestIds);
      if (match && match.element !== anchor) {
        // Swapping away from an already-found anchor (not the initial
        // assignment from null) is the actual upgrade: it means a better
        // candidate showed up after a worse one was already on screen.
        if (anchor) everUpgraded = true;
        resizeObserver?.disconnect();
        anchor = match.element;
        anchor.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        resizeObserver?.observe(anchor);
      }
      if (anchor) measure();

      framesLeft -= 1;
      const isTopPriority = match?.index === 0;
      if ((!isTopPriority || everUpgraded) && framesLeft > 0) {
        frame = window.requestAnimationFrame(settle);
      }
    };
    settle();

    window.addEventListener("resize", measure);
    // Capture so scrolls inside the sidebar's own scroll container count.
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      resizeObserver?.disconnect();
    };
    // anchorKey stands in for the array identity; remeasureKey forces a
    // fresh lookup (not just a re-measure of the same, possibly now-gone,
    // anchor) when something outside the tour's own step change could have
    // swapped which candidate is actually on screen.
  }, [anchorKey, remeasureKey]);

  return rect;
}

/**
 * Dims the page and rings the element the current tutorial step is talking
 * about. Purely visual: it never intercepts clicks. With no anchor on screen
 * it still dims the page, so a centered tip (welcome) reads as a dialog.
 */
export function TutorialSpotlight({ rect }: { rect: SpotlightRect | null }) {
  if (!rect) {
    return (
      <div
        data-testid="tutorial-backdrop"
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[55] bg-[rgba(15,23,42,0.28)]"
      />
    );
  }

  return (
    <div
      data-testid="tutorial-spotlight"
      aria-hidden="true"
      className="pointer-events-none fixed z-[55] rounded-lg ring-2 ring-[#0b81b7] shadow-[0_0_0_9999px_rgba(15,23,42,0.28)] transition-all duration-300 ease-out motion-reduce:transition-none"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}
