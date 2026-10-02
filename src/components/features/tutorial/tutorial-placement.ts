import type { SpotlightRect } from "./tutorial-spotlight";

/** Space between the spotlight ring and the tip bubble. */
const BUBBLE_GAP_PX = 14;
/** Minimum distance the bubble keeps from the viewport edges. */
const VIEWPORT_MARGIN_PX = 12;
/** Keeps the arrow off the bubble's rounded corners. */
const ARROW_INSET_PX = 20;
/** Below this width the bubble docks to the top or bottom edge instead. */
export const TUTORIAL_DOCK_BELOW_WIDTH_PX = 640;

export type TutorialBubbleSide =
  | "right"
  | "bottom"
  | "left"
  | "top"
  | "center"
  | "dock-top"
  | "dock-bottom";

export interface TutorialBubblePlacement {
  side: TutorialBubbleSide;
  top: number;
  left: number;
  /** Arrow position along the bubble edge facing the anchor, in px. */
  arrowOffset: number | null;
}

interface Size {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Where the tip bubble goes for a spotlight `anchor`: beside it on the first
 * side with room (right, bottom, left, top), clamped inside the viewport,
 * with an arrow pointing at the anchor's center. With no anchor it is
 * centered; on narrow screens it docks to whichever edge is away from the
 * anchor so it never covers the thing it is talking about.
 */
export function placeTutorialBubble(
  anchor: SpotlightRect | null,
  bubble: Size,
  viewport: Size,
): TutorialBubblePlacement {
  const m = VIEWPORT_MARGIN_PX;
  const maxTop = viewport.height - bubble.height - m;
  const maxLeft = viewport.width - bubble.width - m;
  const centered: TutorialBubblePlacement = {
    side: "center",
    top: clamp((viewport.height - bubble.height) / 2, m, maxTop),
    left: clamp((viewport.width - bubble.width) / 2, m, maxLeft),
    arrowOffset: null,
  };

  if (!anchor) return centered;

  const left = clamp((viewport.width - bubble.width) / 2, m, maxLeft);
  const anchorCenterX = anchor.left + anchor.width / 2;
  const anchorCenterY = anchor.top + anchor.height / 2;

  if (viewport.width < TUTORIAL_DOCK_BELOW_WIDTH_PX) {
    const anchorInLowerHalf = anchorCenterY > viewport.height / 2;
    return anchorInLowerHalf
      ? { side: "dock-top", top: m, left, arrowOffset: null }
      : { side: "dock-bottom", top: maxTop, left, arrowOffset: null };
  }

  const g = BUBBLE_GAP_PX;
  const anchorRight = anchor.left + anchor.width;
  const anchorBottom = anchor.top + anchor.height;

  const beside = (side: "right" | "left"): TutorialBubblePlacement => {
    const top = clamp(anchorCenterY - bubble.height / 2, m, maxTop);
    return {
      side,
      top,
      left: side === "right" ? anchorRight + g : anchor.left - g - bubble.width,
      arrowOffset: clamp(
        anchorCenterY - top,
        ARROW_INSET_PX,
        bubble.height - ARROW_INSET_PX,
      ),
    };
  };

  const aboveOrBelow = (side: "bottom" | "top"): TutorialBubblePlacement => {
    const bubbleLeft = clamp(anchorCenterX - bubble.width / 2, m, maxLeft);
    return {
      side,
      top:
        side === "bottom" ? anchorBottom + g : anchor.top - g - bubble.height,
      left: bubbleLeft,
      arrowOffset: clamp(
        anchorCenterX - bubbleLeft,
        ARROW_INSET_PX,
        bubble.width - ARROW_INSET_PX,
      ),
    };
  };

  if (anchorRight + g + bubble.width <= viewport.width - m) {
    return beside("right");
  }
  if (anchorBottom + g + bubble.height <= viewport.height - m) {
    return aboveOrBelow("bottom");
  }
  if (anchor.left - g - bubble.width >= m) return beside("left");
  if (anchor.top - g - bubble.height >= m) return aboveOrBelow("top");
  return centered;
}
