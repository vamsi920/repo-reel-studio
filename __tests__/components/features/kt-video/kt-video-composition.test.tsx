import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  KtVideoComposition,
  getActiveLines,
} from "#/components/features/kt-video/kt-video-composition";
import type { KtManifest, KtScene } from "#/lib/kt-video/build-manifest";

vi.mock("remotion", () => ({
  AbsoluteFill: ({
    children,
    style,
  }: {
    children?: React.ReactNode;
    style?: React.CSSProperties;
  }) => <div style={style}>{children}</div>,
  Sequence: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  interpolate: (_frame: number, _input: number[], output: number[]) =>
    output[0],
  spring: () => 1,
  useCurrentFrame: () => 0,
  useVideoConfig: () => ({ fps: 30 }),
}));

vi.mock("#/components/features/kt-video/diagram-panel", () => ({
  DiagramPanel: () => <div data-testid="mock-diagram-panel" />,
}));
vi.mock("#/components/features/kt-video/repo-tree-panel", () => ({
  RepoTreePanel: () => <div data-testid="mock-repo-tree-panel" />,
}));
vi.mock("#/components/features/kt-video/concept-panel", () => ({
  ConceptPanel: () => <div data-testid="mock-concept-panel" />,
}));

function baseScene(overrides: Partial<KtScene>): KtScene {
  return {
    id: 0,
    type: "code",
    file_path: "src/example.ts",
    title: "example",
    code: "line1\nline2\nline3",
    highlight_lines: [1, 1],
    narration_text: "Narration",
    sentences: [],
    focus_symbols: [],
    durationInFrames: 180,
    startFrame: 0,
    endFrame: 180,
    ...overrides,
  };
}

function manifestOf(...scenes: KtScene[]): KtManifest {
  return {
    repo_name: "repo",
    scenes,
    totalFrames: scenes[scenes.length - 1]?.endFrame ?? 1,
    fps: 30,
    repo_files: [],
  };
}

describe("getActiveLines", () => {
  const codeOf = (lineCount: number) =>
    Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`).join("\n");

  it("windows 3 lines above the highlight's first line", () => {
    const scene = baseScene({
      code: codeOf(30),
      highlight_lines: [10, 12],
    });

    const result = getActiveLines(scene, 22);

    expect(result.firstLineNumber).toBe(7);
    expect(result.highlightStart).toBe(10);
    expect(result.highlightEnd).toBe(12);
    expect(result.lines[0]).toBe("line 7");
  });

  it("clamps the window start to line 1 when the highlight starts near the top", () => {
    const scene = baseScene({ code: codeOf(10), highlight_lines: [1, 2] });

    const result = getActiveLines(scene, 22);

    expect(result.firstLineNumber).toBe(1);
    expect(result.lines[0]).toBe("line 1");
  });

  it("clamps the window end to the file's real line count", () => {
    const scene = baseScene({ code: codeOf(10), highlight_lines: [9, 10] });

    const result = getActiveLines(scene, 22);

    // Without the clamp, windowEnd would run to line 27 on a 10-line file.
    expect(result.lines).toHaveLength(5);
    expect(result.lines[result.lines.length - 1]).toBe("line 10");
  });

  it("caps the rendered window at maxLines even for a long file", () => {
    const scene = baseScene({ code: codeOf(100), highlight_lines: [50, 60] });

    const result = getActiveLines(scene, 22);

    expect(result.lines).toHaveLength(22);
    expect(result.firstLineNumber).toBe(47);
  });
});

describe("KtVideoComposition", () => {
  it("shows a placeholder when no scenes exist yet", () => {
    render(<KtVideoComposition manifest={manifestOf()} />);

    expect(
      screen.getByText("Select files to generate a KT video"),
    ).toBeInTheDocument();
  });

  it("renders the code panel by default for code/intro/recap scenes", () => {
    const scene = baseScene({ type: "intro", file_path: "src/index.ts" });

    render(<KtVideoComposition manifest={manifestOf(scene)} />);

    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
    expect(screen.getByText("Narration")).toBeInTheDocument();
  });

  it("routes architecture/flow/diagram scenes to DiagramPanel", () => {
    const scene = baseScene({ type: "architecture" });

    render(<KtVideoComposition manifest={manifestOf(scene)} />);

    expect(screen.getByTestId("mock-diagram-panel")).toBeInTheDocument();
  });

  it("routes repo-tree scenes to RepoTreePanel", () => {
    const scene = baseScene({ type: "repo-tree" });

    render(<KtVideoComposition manifest={manifestOf(scene)} />);

    expect(screen.getByTestId("mock-repo-tree-panel")).toBeInTheDocument();
  });

  it("routes concept scenes to ConceptPanel", () => {
    const scene = baseScene({ type: "concept" });

    render(<KtVideoComposition manifest={manifestOf(scene)} />);

    expect(screen.getByTestId("mock-concept-panel")).toBeInTheDocument();
  });

  it("shows the scene index and title badge", () => {
    const first = baseScene({ id: 0, title: "Intro" });
    const second = baseScene({ id: 1, title: "Recap", startFrame: 180 });

    render(<KtVideoComposition manifest={manifestOf(first, second)} />);

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Recap")).toBeInTheDocument();
  });
});
