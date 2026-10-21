import { Easing, interpolate, spring } from "remotion";

/** Shared look of every tutorial scene: a calm, high-contrast dark IDE. */
export const THEME = {
  bg: "#0b0d12",
  bgRaised: "#12151c",
  bgPanel: "#161a23",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.14)",
  text: "#e8ecf1",
  textMuted: "rgba(232,236,241,0.62)",
  textFaint: "rgba(232,236,241,0.36)",
  accent: "#22e0ff",
  accentSoft: "rgba(34,224,255,0.16)",
  accentGlow: "rgba(34,224,255,0.45)",
  warm: "#ffb454",
  warmSoft: "rgba(255,180,84,0.18)",
  green: "#5be39a",
  purple: "#b48cff",
  fontSans:
    "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontMono:
    "'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace",
} as const;

export const STAGE = { width: 1920, height: 1080 } as const;
export const TOP_BAR_HEIGHT = 64;
export const CAPTION_HEIGHT = 120;

export function easeOut(frame: number, from: number, to: number): number {
  return interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
}

export function easeInOut(frame: number, from: number, to: number): number {
  return interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
}

export function enter(frame: number, fps: number, delay = 0): number {
  return spring({
    frame: frame - delay,
    fps,
    config: { damping: 22, mass: 0.7, stiffness: 140 },
  });
}

/** 1 for most of the beat, fading out over the last `tail` frames. */
export function exitFade(
  relativeFrame: number,
  duration: number,
  tail = 10,
): number {
  return interpolate(relativeFrame, [duration - tail, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function dirName(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}
