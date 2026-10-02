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

/**
 * Returns the first element matching one of `testIds` (in order) that is
 * actually laid out on screen, or `null`. Hidden variants (for example the
 * desktop sidebar on a phone) report an empty rect and are skipped.
 */
export function findTutorialAnchor(
  testIds: readonly string[],
  root: ParentNode = document,
): HTMLElement | null {
  for (const testId of testIds) {
    const candidates = root.querySelectorAll<HTMLElement>(
      `[data-testid="${CSS.escape(testId)}"]`,
    );
    for (const element of candidates) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return element;
    }
  }
  return null;
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
export function useTutorialAnchorRect(
  anchorTestIds?: readonly string[],
): SpotlightRect | null {
  const [rect, setRect] = React.useState<SpotlightRect | null>(null);
  const anchorKey = anchorTestIds?.join("|") ?? "";

  React.useEffect(() => {
    setRect(null);
    if (!anchorTestIds?.length) return undefined;

    let anchor: HTMLElement | null = null;
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

    const lookup = () => {
      anchor = findTutorialAnchor(anchorTestIds);
      if (anchor) {
        anchor.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        measure();
        resizeObserver?.observe(anchor);
        return;
      }
      framesLeft -= 1;
      if (framesLeft > 0) frame = window.requestAnimationFrame(lookup);
    };
    lookup();

    window.addEventListener("resize", measure);
    // Capture so scrolls inside the sidebar's own scroll container count.
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      resizeObserver?.disconnect();
    };
    // anchorKey stands in for the array identity.
  }, [anchorKey]);

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
        className="pointer-events-none fixed inset-0 z-[55] bg-black/55"
      />
    );
  }

  return (
    <div
      data-testid="tutorial-spotlight"
      aria-hidden="true"
      className="pointer-events-none fixed z-[55] rounded-lg ring-2 ring-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-all duration-300 ease-out motion-reduce:transition-none"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}
