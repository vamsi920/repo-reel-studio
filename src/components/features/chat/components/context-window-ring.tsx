import { cn } from "#/utils/utils";
import { getContextFillTone } from "#/components/features/conversation/usage-panel/context-meter";

const CONTEXT_WINDOW_RING_SIZE = 16;
const CONTEXT_WINDOW_RING_STROKE = 2;

/**
 * How far the ring's unfilled track is mixed from its own backdrop toward
 * `--oh-foreground`, as a percentage.
 *
 * The track is derived from the foreground rather than pinned to a scale stop.
 * It carries information (the arc's proportion is only readable against it), so
 * it is a foreground element, and every stop in the surface family sits close
 * to the surfaces it delimits. Drawing it with `--oh-border` put it in that
 * family: it was 1.57:1 against the composer at rest, and the trigger's hover
 * fill resolves to the same stop, taking it to 1.00:1. No stop in that family
 * fixes it, and no fixed stop holds across the three palettes in
 * `color-themes.ts`, whose scales differ.
 *
 * Two properties of the mix are load-bearing, and both were wrong before:
 *
 * 1. **Mix against the backdrop, not `transparent`.** A translucent track is
 *    composited by the browser in gamma-encoded sRGB, which is not symmetric
 *    between light and dark backdrops: the same alpha lands much closer to the
 *    surface on a light palette. `Neo-DeepSea` — the default theme — is light,
 *    and the previous 42% alpha left the track at 2.70:1 against the composer,
 *    under the 3:1 that WCAG 2.1 SC 1.4.11 asks of non-text contrast. No single
 *    alpha satisfies both a light and a dark palette: the feasible bands are
 *    disjoint (0.457-0.622 for deepsea, 0.399-0.453 for the neutral scale).
 * 2. **Mix in `oklab`.** Interpolating perceptually makes one ratio work for
 *    every shipped palette; 53% keeps the worst case at 3.17:1.
 *
 * `context-window-ring.test.tsx` asserts both per theme.
 */
export const CONTEXT_WINDOW_RING_TRACK_MIX = 53;

/**
 * The ring sits on the composer, so its track is anchored to `--oh-surface`
 * (and stays legible under the trigger's `hover:bg-white/10` fill).
 */
export const CONTEXT_WINDOW_TRACK_COLOR = `color-mix(in oklab, var(--oh-foreground) ${CONTEXT_WINDOW_RING_TRACK_MIX}%, var(--oh-surface))`;

/**
 * The usage popover's bar sits on `bg-tertiary`, a much weaker pairing: the
 * foreground is only 8.6:1 from that panel under the default palette, so the
 * two 3:1 steps a track needs (track-from-panel, arc-from-track) do not both
 * fit. 46% is the ratio that maximises the worst case there — 2.96:1, up from
 * 2.42:1 — and the remaining gap is a property of the panel color, not of this
 * value. Fixing it properly means giving the popover a surface further from
 * the foreground.
 */
export const CONTEXT_WINDOW_METER_TRACK_MIX = 46;

export const CONTEXT_WINDOW_METER_TRACK_COLOR = `color-mix(in oklab, var(--oh-foreground) ${CONTEXT_WINDOW_METER_TRACK_MIX}%, var(--oh-color-tertiary))`;

const TONE_STROKE = {
  neutral: "var(--oh-foreground)",
  warning: "#f59e0b", // amber-500
  danger: "#ef4444", // red-500
} as const;

interface ContextWindowRingProps {
  percentage: number;
  className?: string;
}

export function ContextWindowRing({
  percentage,
  className,
}: ContextWindowRingProps) {
  const radius = (CONTEXT_WINDOW_RING_SIZE - CONTEXT_WINDOW_RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPercentage = Math.min(100, Math.max(0, percentage));
  const dashOffset = circumference - (clampedPercentage / 100) * circumference;
  const tone = getContextFillTone(clampedPercentage);

  return (
    <svg
      width={CONTEXT_WINDOW_RING_SIZE}
      height={CONTEXT_WINDOW_RING_SIZE}
      viewBox={`0 0 ${CONTEXT_WINDOW_RING_SIZE} ${CONTEXT_WINDOW_RING_SIZE}`}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <circle
        cx={CONTEXT_WINDOW_RING_SIZE / 2}
        cy={CONTEXT_WINDOW_RING_SIZE / 2}
        r={radius}
        fill="none"
        style={{ stroke: CONTEXT_WINDOW_TRACK_COLOR }}
        strokeWidth={CONTEXT_WINDOW_RING_STROKE}
        data-testid="context-window-ring-track"
      />
      <circle
        cx={CONTEXT_WINDOW_RING_SIZE / 2}
        cy={CONTEXT_WINDOW_RING_SIZE / 2}
        r={radius}
        fill="none"
        stroke={TONE_STROKE[tone]}
        strokeWidth={CONTEXT_WINDOW_RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${CONTEXT_WINDOW_RING_SIZE / 2} ${CONTEXT_WINDOW_RING_SIZE / 2})`}
        className="transition-[stroke-dashoffset,stroke] duration-300"
        data-testid="context-window-ring-arc"
      />
    </svg>
  );
}
