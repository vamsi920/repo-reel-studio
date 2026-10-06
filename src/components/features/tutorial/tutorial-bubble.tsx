import React from "react";
import { cn } from "#/utils/utils";
import { TutorialSpotlight, type SpotlightRect } from "./tutorial-spotlight";
import {
  placeTutorialBubble,
  type TutorialBubblePlacement,
} from "./tutorial-placement";

interface Size {
  width: number;
  height: number;
}

function readViewport(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * Current viewport size. Re-renders on `resize`, but reads the window live
 * on every render so placement is never computed against a stale size.
 */
export function useViewportSize(): Size {
  const [, rerender] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("resize", rerender);
    return () => window.removeEventListener("resize", rerender);
  }, []);
  return readViewport();
}

/**
 * Live border-box size of `ref`'s element, `null` until first measured.
 * Re-measured whenever `contentKey` changes (new tip text) as well as on
 * ResizeObserver callbacks.
 */
export function useElementSize(
  ref: React.RefObject<HTMLElement | null>,
  contentKey: string,
): Size | null {
  const [size, setSize] = React.useState<Size | null>(null);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () =>
      setSize({ width: element.offsetWidth, height: element.offsetHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, contentKey]);
  return size;
}

const ARROW_SIZE_PX = 10;

/**
 * Bubble colors per step `tone`, as fixed literal colors rather than theme
 * tokens: the light theme remaps Tailwind's `white` to dark ink
 * (src/styles/neo-tokens.css) and --oh-* tokens flip between themes, so
 * neither may be used in here or the card's contrast changes with the theme
 * behind it. "light" is a pale-blue card matching the app's own light canvas
 * and brand blue (#0b81b7, --primary-500); "dark" marks the Security step.
 */
export const BUBBLE_PALETTES = {
  light: {
    card: "border-[#d4e4f3] bg-[#f6faff] text-[#0f172a] shadow-[0_12px_40px_rgba(11,129,183,0.18)]",
    arrow: "border-[#d4e4f3] bg-[#f6faff]",
    progress: "text-[#0b81b7]",
    muted: "text-[#64748b] hover:bg-[#e6f0fa] hover:text-[#0f172a]",
    subtitle: "text-[#334155]",
    point: "text-[#475569]",
    bullet: "bg-[#0b81b7]",
    track: "bg-[#d4e4f3]",
    fill: "bg-[#0b81b7]",
    dotActive: "bg-[#0b81b7]",
    dot: "bg-[#c3d6ea]",
    ghost: "text-[#334155] hover:bg-[#e6f0fa]",
    primary: "bg-[#0b81b7] text-[#ffffff] hover:bg-[#096a97]",
  },
  dark: {
    card: "border-[#1e293b] bg-[#0b1220] text-[#f8fafc] shadow-[0_12px_40px_rgba(2,6,23,0.55)]",
    arrow: "border-[#1e293b] bg-[#0b1220]",
    progress: "text-[#7dd3fc]",
    muted: "text-[#94a3b8] hover:bg-[#1e293b] hover:text-[#f8fafc]",
    subtitle: "text-[#e2e8f0]",
    point: "text-[#cbd5e1]",
    bullet: "bg-[#f87171]",
    track: "bg-[#1e293b]",
    fill: "bg-[#7dd3fc]",
    dotActive: "bg-[#7dd3fc]",
    dot: "bg-[#334155]",
    ghost: "text-[#e2e8f0] hover:bg-[#1e293b]",
    primary: "bg-[#0ea5e9] text-[#0b1220] hover:bg-[#38bdf8]",
  },
} as const;

/** Small diamond on the bubble edge that faces the spotlight. */
function BubbleArrow({
  placement,
  className,
}: {
  placement: TutorialBubblePlacement;
  className: string;
}) {
  const { side, arrowOffset } = placement;
  if (arrowOffset === null) return null;
  const half = ARROW_SIZE_PX / 2;
  const edge: React.CSSProperties =
    side === "right"
      ? { left: -half, top: arrowOffset - half }
      : side === "left"
        ? { right: -half, top: arrowOffset - half }
        : side === "bottom"
          ? { top: -half, left: arrowOffset - half }
          : { bottom: -half, left: arrowOffset - half };
  return (
    <span
      aria-hidden="true"
      data-testid="tutorial-bubble-arrow"
      className={cn(
        "absolute rotate-45 border transition-all duration-300 ease-out motion-reduce:transition-none",
        className,
      )}
      style={{ ...edge, width: ARROW_SIZE_PX, height: ARROW_SIZE_PX }}
    />
  );
}

export type TutorialBubbleTone = keyof typeof BUBBLE_PALETTES;
export type TutorialBubblePalette =
  (typeof BUBBLE_PALETTES)[TutorialBubbleTone];

/**
 * The shared frame of every tour bubble — the static product tour and the AI
 * guide alike: the dimming spotlight around `anchorRect`, a fixed-position
 * card placed beside it (`placeTutorialBubble`), the arrow pointing at it,
 * the tone palette, and the vertically-scrolling body. Callers render only
 * the content, which receives the palette for the active tone.
 */
export function TutorialBubbleFrame({
  anchorRect,
  tone,
  contentKey,
  labelledBy,
  describedBy,
  dataAttributes,
  elevated = false,
  children,
}: {
  anchorRect: SpotlightRect | null;
  tone: TutorialBubbleTone;
  /** Changes whenever the content changes, so the card is re-measured. */
  contentKey: string;
  labelledBy: string;
  describedBy: string;
  dataAttributes?: Record<`data-${string}`, string>;
  /**
   * Layer above the app's dialogs. The AI guide needs this because the
   * element it points at can be inside a dialog the user just opened; the
   * static tour stays below them.
   */
  elevated?: boolean;
  children: (palette: TutorialBubblePalette) => React.ReactNode;
}) {
  const palette = BUBBLE_PALETTES[tone];
  const bubbleRef = React.useRef<HTMLElement>(null);
  const bubbleSize = useElementSize(bubbleRef, contentKey);
  const viewport = useViewportSize();
  const placement = bubbleSize
    ? placeTutorialBubble(anchorRect, bubbleSize, viewport)
    : null;

  return (
    <>
      <TutorialSpotlight rect={anchorRect} elevated={elevated} />
      <section
        ref={bubbleRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        data-testid="tutorial-wizard"
        {...dataAttributes}
        data-placement={placement?.side ?? "measuring"}
        data-tone={tone}
        // Fixed literal colors per tone; see BUBBLE_PALETTES.
        // The section only frames and positions the bubble; it never scrolls.
        // Scrolling lives on the inner body (see below) so the arrow, which
        // pokes out past the edge, can't make the bubble scrollable.
        className={cn(
          "fixed w-[min(calc(100vw-24px),380px)] rounded-2xl border",
          elevated ? "z-[80]" : "z-[60]",
          "transition-[top,left,opacity,background-color,color] duration-300 ease-out motion-reduce:transition-none",
          palette.card,
          placement ? "opacity-100" : "opacity-0",
        )}
        style={{ top: placement?.top ?? 0, left: placement?.left ?? 0 }}
      >
        {placement ? (
          <BubbleArrow placement={placement} className={palette.arrow} />
        ) : null}
        {/* Vertical scroll only, for short viewports or heavy zoom. Horizontal
            overflow is clipped: a scrollable x-axis once let the autofocused
            Next button scroll every line of text out of sight, leaving an
            empty-looking box. */}
        <div
          data-testid="tutorial-bubble-body"
          className="max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden px-5 py-4"
        >
          {children(palette)}
        </div>
      </section>
    </>
  );
}
