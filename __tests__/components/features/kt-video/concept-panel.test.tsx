import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConceptPanel } from "#/components/features/kt-video/concept-panel";
import type { KtConceptSegment, KtScene } from "#/lib/kt-video/build-manifest";

// Keep the real `spring`/`interpolate` math (it's what the opacity bug lives
// in) and only fake the composition context `useVideoConfig` needs.
vi.mock("remotion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("remotion")>();
  return { ...actual, useVideoConfig: () => ({ fps: 30 }) };
});

function segment(i: number): KtConceptSegment {
  return {
    file_path: `src/step-${i}.ts`,
    start_line: 1,
    end_line: 3,
    symbol: `step${i}`,
    code: "a\nb\nc",
  };
}

function conceptScene(durationInFrames: number, count: number): KtScene {
  return {
    id: 0,
    type: "concept",
    file_path: "src/step-0.ts",
    title: "real flow",
    code: "a\nb\nc",
    highlight_lines: [1, 3],
    narration_text: "",
    sentences: [],
    focus_symbols: [],
    durationInFrames,
    startFrame: 0,
    endFrame: durationInFrames,
    segments: Array.from({ length: count }, (_, i) => segment(i)),
  };
}

describe("ConceptPanel", () => {
  it("keeps fading the last segment near its trailing edge instead of snapping back to full opacity", () => {
    // 750 frames over 4 segments doesn't divide evenly (perSegmentFrames =
    // floor(750/4) = 187, remainder 2), so the last segment's own window
    // runs a couple of frames past the point where `exit` hits its clamped
    // floor of 0.4 — exactly the case that used to trip the `exit === 0.4`
    // branch and flash the panel back to full opacity right before the cut.
    const scene = conceptScene(750, 4);

    render(<ConceptPanel scene={scene} relativeFrame={748} />);

    const panel = screen.getByTestId("kt-concept-active-segment");
    const opacity = Number(panel.style.opacity);
    expect(opacity).toBeCloseTo(0.4, 5);
  });

  it("still fades fully in once a segment starts", () => {
    const scene = conceptScene(750, 4);

    render(<ConceptPanel scene={scene} relativeFrame={561} />);

    const panel = screen.getByTestId("kt-concept-active-segment");
    // Right at the start of a segment the enter spring hasn't caught up yet,
    // so opacity should be low, not the exit floor.
    expect(Number(panel.style.opacity)).toBeLessThan(0.4);
  });
});
