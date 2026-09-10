import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ContextWindowRing,
  CONTEXT_WINDOW_RING_TRACK_MIX,
} from "#/components/features/chat/components/context-window-ring";
import { COLOR_THEMES } from "#/themes/color-themes";

/**
 * WCAG 2.1 SC 1.4.11 asks 3:1 for non-text contrast. The ring's track carries
 * information (the arc's proportion is only readable against it), so it is held
 * to that bar rather than treated as chrome.
 */
const MIN_RATIO = 3;

/**
 * Themes are read from `color-themes.ts`, not from a stylesheet. `index.css`
 * ships the deepsea scale but `DEFAULT_COLOR_THEME` overrides it at runtime, so
 * a stylesheet-derived assertion validates a palette no default install renders.
 */
const SURFACE_STOP = "--cool-grey-925"; // --oh-surface, the composer background
const FOREGROUND_STOP = "--cool-grey-100"; // --oh-foreground, the neutral arc

/** `chatInputIconButtonClassName` fills the trigger with `hover:bg-white/10`. */
const HOVER_OVERLAY = "#FFFFFF";
const HOVER_ALPHA = 0.1;

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const v =
    value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (high + 0.05) / (low + 0.05);
}

/** Composite a translucent overlay onto an opaque backdrop, as the browser does. */
function composite(overlay: string, backdrop: string, alpha: number): string {
  const o = channels(overlay);
  const b = channels(backdrop);
  return `#${o
    .map((channel, i) =>
      Math.round(alpha * channel + (1 - alpha) * b[i])
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

const cbrt = (x: number) => (x < 0 ? -((-x) ** (1 / 3)) : x ** (1 / 3));

function toOklab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(toLinear);
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: [number, number, number]): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb
    .map((channel) => fromLinear(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

/** `color-mix(in oklab, <color> <percent>%, <backdrop>)`. */
function mixInOklab(color: string, backdrop: string, percent: number): string {
  const a = toOklab(color);
  const b = toOklab(backdrop);
  const p = percent / 100;
  return fromOklab([
    p * a[0] + (1 - p) * b[0],
    p * a[1] + (1 - p) * b[1],
    p * a[2] + (1 - p) * b[2],
  ]);
}

describe("ContextWindowRing", () => {
  it("draws the track and the arc in different tones", () => {
    render(<ContextWindowRing percentage={5} />);

    const track = screen.getByTestId("context-window-ring-track");
    const arc = screen.getByTestId("context-window-ring-arc");

    expect(track.style.stroke).not.toEqual(arc.getAttribute("stroke"));
  });

  it("derives the track from the foreground rather than a scale stop", () => {
    render(<ContextWindowRing percentage={5} />);

    // A stop-pinned track cannot hold across palettes; see the constant's docs.
    expect(screen.getByTestId("context-window-ring-track").style.stroke).toEqual(
      expect.stringContaining("var(--oh-foreground)"),
    );
  });

  /**
   * Read the mix back out of what the component actually renders, so the
   * contrast cases below describe the shipped track rather than a constant that
   * could drift away from it.
   */
  function renderedTrackMix(): { percent: number; backdropVar: string } {
    render(<ContextWindowRing percentage={5} />);
    const { stroke } = screen.getByTestId("context-window-ring-track").style;
    const parsed = stroke.match(
      /color-mix\(in oklab,\s*var\(--oh-foreground\)\s+([\d.]+)%,\s*var\((--[\w-]+)\)\)/,
    );
    if (!parsed) {
      throw new Error(`track is not an oklab foreground mix: ${stroke}`);
    }
    return { percent: Number(parsed[1]), backdropVar: parsed[2] };
  }

  it("renders the mix it documents", () => {
    expect(renderedTrackMix().percent).toBeCloseTo(
      CONTEXT_WINDOW_RING_TRACK_MIX,
      5,
    );
  });

  /**
   * A translucent track is composited in gamma-encoded sRGB, which lands at a
   * very different lightness on a light palette than on a dark one — no single
   * alpha clears 3:1 on both. Anchoring the mix to the backdrop it is drawn on,
   * and interpolating in oklab, is what makes one ratio hold everywhere.
   */
  it("anchors the track to the surface it is drawn on", () => {
    expect(renderedTrackMix().backdropVar).toEqual("--oh-surface");
  });

  describe.each(Object.entries(COLOR_THEMES))(
    "contrast under the %s palette",
    (_key, theme) => {
      const surface = theme.scale[SURFACE_STOP];
      const arc = theme.scale[FOREGROUND_STOP];
      const hoverFill = composite(HOVER_OVERLAY, surface, HOVER_ALPHA);
      const renderedTrack = () =>
        mixInOklab(arc, surface, renderedTrackMix().percent);

      it("keeps the track legible against the composer surface", () => {
        expect(contrastRatio(renderedTrack(), surface)).toBeGreaterThanOrEqual(
          MIN_RATIO,
        );
      });

      it("keeps the track legible under the trigger's hover fill", () => {
        expect(
          contrastRatio(renderedTrack(), hoverFill),
        ).toBeGreaterThanOrEqual(MIN_RATIO);
      });

      it("keeps a neutral arc distinguishable from the track", () => {
        expect(contrastRatio(arc, renderedTrack())).toBeGreaterThanOrEqual(
          MIN_RATIO,
        );
      });
    },
  );
});
