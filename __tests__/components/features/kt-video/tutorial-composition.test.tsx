import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  KtTutorialComposition,
  buildBeatContexts,
} from "#/components/features/kt-video/tutorial/tutorial-composition";
import type {
  KtTutorial,
  TutorialBeat,
  TutorialChapter,
  TutorialVisual,
} from "#/lib/kt-video/tutorial-types";

let currentFrame = 0;
vi.mock("remotion", () => ({
  AbsoluteFill: ({
    children,
    style,
  }: {
    children?: React.ReactNode;
    style?: React.CSSProperties;
  }) => <div style={style}>{children}</div>,
  Sequence: ({
    children,
    name,
  }: {
    children?: React.ReactNode;
    name?: string;
  }) => <div data-testid={`sequence-${name}`}>{children}</div>,
  Audio: ({ src }: { src: string }) => (
    <div data-testid="beat-audio" data-src={src} />
  ),
  interpolate: (_frame: number, _input: number[], output: number[]) =>
    output[output.length - 1],
  spring: () => 1,
  Easing: { out: () => undefined, inOut: () => undefined, cubic: undefined },
  useCurrentFrame: () => currentFrame,
  useVideoConfig: () => ({ fps: 30 }),
}));

vi.mock("#/components/features/markdown/syntax-highlighter", () => ({
  SyntaxHighlighter: ({ children }: { children: string }) => (
    <pre data-testid="highlighted-code">{children}</pre>
  ),
}));

function beat(
  id: string,
  visual: TutorialVisual,
  start: number,
  duration = 90,
): TutorialBeat {
  return {
    id,
    narration: `Narration for ${id}`,
    visual,
    startFrame: start,
    durationInFrames: duration,
  };
}

function chapter(
  id: string,
  kind: TutorialChapter["kind"],
  beats: TutorialBeat[],
): TutorialChapter {
  const start = beats[0]?.startFrame ?? 0;
  const last = beats[beats.length - 1];
  return {
    id,
    kind,
    title: `Chapter ${id}`,
    goal: `Goal ${id}`,
    beats,
    startFrame: Math.max(0, start - 33),
    durationInFrames: last
      ? last.startFrame + last.durationInFrames - Math.max(0, start - 33)
      : 1,
  };
}

const FILES = {
  "src/app.ts": Array.from(
    { length: 40 },
    (_, i) => `const line${i + 1} = ${i + 1};`,
  ).join("\n"),
  "src/util.ts": "export const x = 1;\n",
};

function tutorialOf(
  chapters: TutorialChapter[],
  audio?: KtTutorial["audio"],
): KtTutorial {
  const beats = chapters.flatMap((c) => c.beats);
  const last = beats[beats.length - 1];
  return {
    version: 2,
    repoName: "acme/app",
    pageTitle: "Routing",
    commitSha: "abc1234",
    fps: 30,
    files: FILES,
    fileTree: Object.keys(FILES),
    diagrams: {
      d0: {
        id: "d0",
        kind: "flowchart",
        direction: "DOWN",
        mermaid: "graph TD; A-->B",
        nodes: [
          {
            id: "A",
            label: "Entry",
            shape: "rect",
            x: 0,
            y: 0,
            width: 120,
            height: 40,
          },
          {
            id: "B",
            label: "Store",
            shape: "cylinder",
            x: 0,
            y: 120,
            width: 120,
            height: 40,
          },
        ],
        edges: [
          {
            id: "e0",
            from: "A",
            to: "B",
            style: "solid",
            points: [
              { x: 60, y: 40 },
              { x: 60, y: 120 },
            ],
          },
        ],
        groups: [],
        messages: [],
        width: 120,
        height: 160,
      },
    },
    chapters,
    totalFrames: last ? last.startFrame + last.durationInFrames : 1,
    audio,
    scriptSource: "llm",
    wordCount: 100,
  };
}

describe("buildBeatContexts", () => {
  it("tracks open tabs per chapter and introduces each diagram only once", () => {
    const tutorial = tutorialOf([
      chapter("c1", "deep-dive", [
        beat(
          "b1",
          { kind: "code", path: "src/app.ts", startLine: 1, endLine: 10 },
          33,
        ),
        beat(
          "b2",
          { kind: "code", path: "src/util.ts", startLine: 1, endLine: 1 },
          123,
        ),
        beat(
          "b3",
          { kind: "diagram", diagramId: "d0", focusNodes: ["A"] },
          213,
        ),
      ]),
      chapter("c2", "architecture", [
        beat(
          "b4",
          { kind: "diagram", diagramId: "d0", focusNodes: ["B"] },
          336,
        ),
        beat(
          "b5",
          { kind: "code", path: "src/app.ts", startLine: 20, endLine: 30 },
          426,
        ),
      ]),
    ]);

    const contexts = buildBeatContexts(tutorial);

    expect(contexts.map((c) => c.openTabs)).toEqual([
      ["src/app.ts"],
      ["src/app.ts", "src/util.ts"],
      ["src/app.ts", "src/util.ts"],
      [],
      ["src/app.ts"],
    ]);
    expect(contexts.map((c) => c.introduceDiagram)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(contexts[4].previous?.id).toBe("b4");
  });
});

describe("KtTutorialComposition", () => {
  it("renders every beat's visual, captions and narration audio with the chapter chrome", () => {
    currentFrame = 40;
    const tutorial = tutorialOf(
      [
        chapter("c1", "intro", [
          beat(
            "b1",
            {
              kind: "title",
              heading: "Routing in acme",
              bullets: ["Where it lives", "How it works"],
            },
            33,
          ),
          beat(
            "b2",
            {
              kind: "code",
              path: "src/app.ts",
              startLine: 5,
              endLine: 12,
              focus: [6, 7],
              callout: "entry point",
            },
            123,
          ),
          beat(
            "b3",
            {
              kind: "diagram",
              diagramId: "d0",
              focusNodes: ["A"],
              callout: "starts here",
            },
            213,
          ),
          beat("b4", { kind: "tree", focusPaths: ["src/util.ts"] }, 303),
          beat(
            "b5",
            {
              kind: "flow",
              steps: [
                {
                  path: "src/app.ts",
                  startLine: 1,
                  endLine: 8,
                  symbol: "boot",
                },
                { path: "src/util.ts", startLine: 1, endLine: 1 },
              ],
              activeStep: 1,
            },
            393,
          ),
          beat(
            "b6",
            {
              kind: "cards",
              items: [
                { title: "boot", body: "Starts the app", path: "src/app.ts" },
              ],
              revealCount: 1,
            },
            483,
          ),
        ]),
      ],
      { b2: { url: "blob:narration-b2", durationSeconds: 3 } },
    );

    render(<KtTutorialComposition tutorial={tutorial} />);

    expect(
      screen.getByRole("group", { name: "Routing in acme" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Where it lives")).toBeInTheDocument();
    expect(
      screen.getByRole("group", {
        name: /Editor showing src\/app.ts lines 5 to 12/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("entry point")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /flowchart diagram, focusing A/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("starts here")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Repository map" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Call chain" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Key takeaways" }),
    ).toHaveTextContent("Starts the app");
    expect(screen.getByTestId("beat-audio")).toHaveAttribute(
      "data-src",
      "blob:narration-b2",
    );
    expect(screen.getByText("Narration for b2")).toBeInTheDocument();
    expect(screen.getByText("Chapter c1")).toBeInTheDocument();
    expect(screen.getByText("acme/app")).toBeInTheDocument();
  });

  it("can hide captions and shows the no-scenes placeholder for an empty tutorial", () => {
    currentFrame = 0;
    const tutorial = tutorialOf([
      chapter("c1", "intro", [
        beat("b1", { kind: "title", heading: "Hello" }, 33),
      ]),
    ]);

    const { unmount } = render(
      <KtTutorialComposition tutorial={tutorial} captions={false} />,
    );
    expect(screen.queryByText("Narration for b1")).not.toBeInTheDocument();
    unmount();

    render(<KtTutorialComposition tutorial={tutorialOf([])} />);
    expect(screen.getByText("KT$VIDEO_NO_ELIGIBLE_SCENES")).toBeInTheDocument();
  });
});
