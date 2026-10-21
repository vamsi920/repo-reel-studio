import { describe, expect, it, vi } from "vitest";
import { buildRegionIndex } from "#/lib/kt-video/code-regions";
import {
  buildDeterministicScript,
  generateScript,
  MIN_TUTORIAL_WORDS,
  normalizeBeats,
  validateVisual,
  type ScriptContext,
} from "#/lib/kt-video/tutorial-script";
import type { TutorialDiagram } from "#/lib/kt-video/tutorial-types";
import { countWords } from "#/lib/kt-video/tutorial-types";
import { timeTutorial } from "#/lib/kt-video/tutorial-timing";

const SERVER_TS = `import { createServer } from "http";
import { parse } from "./parse";

/** Starts the HTTP server. */
export function start(port: number) {
  const server = createServer((req, res) => {
    const route = parse(req.url ?? "/");
    if (!route) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.end(route.name);
  });
  server.listen(port);
  return server;
}

export function stop(server: { close(): void }) {
  server.close();
}
`;

const PARSE_TS = `export interface Route {
  name: string;
}

export function parse(url: string): Route | null {
  if (url === "/") return { name: "home" };
  return null;
}
`;

const DIAGRAM: TutorialDiagram = {
  id: "d0",
  kind: "flowchart",
  direction: "DOWN",
  mermaid: "graph TD; Router-->Handler; Handler-->Store",
  nodes: [
    {
      id: "Router",
      label: "Router",
      shape: "rect",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
    },
    {
      id: "Handler",
      label: "Request handler",
      shape: "rect",
      x: 0,
      y: 100,
      width: 100,
      height: 40,
    },
    {
      id: "Store",
      label: "Database",
      shape: "cylinder",
      x: 0,
      y: 200,
      width: 100,
      height: 40,
    },
  ],
  edges: [
    { id: "e0", from: "Router", to: "Handler", style: "solid", points: [] },
    { id: "e1", from: "Handler", to: "Store", style: "solid", points: [] },
  ],
  groups: [],
  messages: [],
  width: 100,
  height: 240,
};

function contextOf(): ScriptContext {
  const files = { "src/server.ts": SERVER_TS, "src/parse.ts": PARSE_TS };
  return {
    repoName: "acme/http",
    pageTitle: "HTTP server",
    pageDescription: "How requests are routed.",
    pageMarkdown:
      "# HTTP server\n\nThe `start` function in server.ts creates the HTTP server and delegates URL parsing to `parse`. The parse function returns a Route or null when nothing matches.\n\n```mermaid\ngraph TD; Router-->Handler\n```\n",
    files,
    fileTree: Object.keys(files).sort(),
    regions: buildRegionIndex(files),
    diagrams: { d0: DIAGRAM },
    conceptHops: [
      { path: "src/server.ts", startLine: 5, endLine: 18, symbol: "start" },
      { path: "src/parse.ts", startLine: 5, endLine: 8, symbol: "parse" },
    ],
  };
}

describe("buildRegionIndex", () => {
  it("indexes the header and every symbol with real line ranges", () => {
    const regions = buildRegionIndex({ "src/server.ts": SERVER_TS });

    expect(
      regions.map((r) => [r.kind, r.symbol, r.startLine, r.endLine]),
    ).toEqual([
      ["head", undefined, 1, 2],
      ["function", "start", 4, 17],
      ["function", "stop", 19, 21],
    ]);
  });
});

describe("validateVisual", () => {
  const ctx = contextOf();
  const chapter = {
    kind: "deep-dive" as const,
    regions: ["R2"],
    diagram: "d0",
  };

  it("resolves a code visual to its region and clamps lines and focus to the file", () => {
    const visual = validateVisual(
      {
        type: "code",
        region: "R2",
        lines: [3, 999],
        focus: [8, 9],
        callout: "**404 path**",
      },
      ctx,
      chapter,
    );

    expect(visual).toEqual({
      kind: "code",
      path: "src/server.ts",
      startLine: 3,
      endLine: 22,
      focus: [8, 9],
      symbol: "start",
      callout: "404 path",
    });
  });

  it("falls back to the chapter's first region when the id is unknown, and matches symbols by name", () => {
    expect(
      validateVisual({ type: "code", region: "R99" }, ctx, chapter),
    ).toMatchObject({
      path: "src/server.ts",
      symbol: "start",
    });
    expect(
      validateVisual({ type: "code", region: "parse" }, ctx, chapter),
    ).toMatchObject({
      path: "src/parse.ts",
      symbol: "parse",
    });
  });

  it("matches diagram nodes by id or label and drops the rest", () => {
    const visual = validateVisual(
      {
        type: "diagram",
        diagram: "d0",
        nodes: ["router", "request handler", "Nope"],
      },
      ctx,
      chapter,
    );

    expect(visual).toEqual({
      kind: "diagram",
      diagramId: "d0",
      focusNodes: ["Router", "Handler"],
      callout: undefined,
    });
  });

  it("expands a directory path in a tree visual and keeps only real files", () => {
    const visual = validateVisual(
      { type: "tree", paths: ["src/", "lib/missing.ts", "parse.ts"] },
      ctx,
      chapter,
    );

    expect(visual).toEqual({
      kind: "tree",
      focusPaths: ["src/parse.ts", "src/server.ts"],
      callout: undefined,
    });
  });

  it("rejects unknown visual types and flows with fewer than two real steps", () => {
    expect(validateVisual({ type: "hologram" }, ctx, chapter)).toBeNull();
    expect(
      validateVisual(
        { type: "flow", steps: [{ region: "R2" }, { region: "nope" }] },
        ctx,
        chapter,
      ),
    ).toBeNull();
  });
});

describe("normalizeBeats", () => {
  it("drops empty narration, strips markdown, splits very long beats and reuses the last visual", () => {
    const ctx = contextOf();
    const long = Array.from({ length: 90 }, (_, i) => `word${i}.`).join(" ");
    const beats = normalizeBeats(
      {
        beats: [
          { say: "", show: { type: "code", region: "R2" } },
          {
            say: "Let's look at the **start** function first.",
            show: { type: "code", region: "R2" },
          },
          { say: long, show: { type: "bogus" } },
        ],
      },
      ctx,
      { id: "c3", kind: "deep-dive", regions: ["R2"] },
    );

    expect(beats.length).toBeGreaterThanOrEqual(3);
    expect(beats[0].narration).toBe("Let's look at the start function first.");
    expect(
      beats.every(
        (b) => b.visual.kind === "code" && b.visual.path === "src/server.ts",
      ),
    ).toBe(true);
    expect(beats.every((b) => countWords(b.narration) <= 70)).toBe(true);
  });
});

describe("buildDeterministicScript", () => {
  it("produces a full tutorial grounded in the real files, diagram and docs without an LLM", () => {
    const ctx = contextOf();
    const script = buildDeterministicScript(ctx);

    const kinds = script.chapters.map((c) => c.kind);
    expect(kinds[0]).toBe("intro");
    expect(kinds).toContain("map");
    expect(kinds).toContain("architecture");
    expect(kinds).toContain("flow");
    expect(kinds[kinds.length - 1]).toBe("recap");
    expect(script.source).toBe("deterministic");

    const codeBeats = script.chapters
      .flatMap((c) => c.beats)
      .filter((b) => b.visual.kind === "code");
    expect(
      codeBeats.some(
        (b) => b.visual.kind === "code" && b.visual.symbol === "start",
      ),
    ).toBe(true);
    // Narration drawn from the page documentation, tied to the symbol on screen.
    expect(codeBeats.map((b) => b.narration).join(" ")).toContain(
      "delegates URL parsing",
    );
    const diagramBeats = script.chapters
      .flatMap((c) => c.beats)
      .filter((b) => b.visual.kind === "diagram");
    expect(
      diagramBeats.some(
        (b) =>
          b.visual.kind === "diagram" && b.visual.focusNodes.includes("Router"),
      ),
    ).toBe(true);
  });
});

describe("generateScript", () => {
  it("plans with one call, writes every chapter, validates visuals and keeps the chapter order", async () => {
    const ctx = contextOf();
    const chat = vi.fn(async (prompt: string) => {
      if (prompt.includes("planning a")) {
        return JSON.stringify({
          chapters: [
            {
              id: "c1",
              kind: "intro",
              title: "Welcome",
              goal: "Why",
              regions: [],
              diagram: null,
              words: 150,
            },
            {
              id: "c2",
              kind: "deep-dive",
              title: "The server",
              goal: "How",
              regions: ["R2"],
              diagram: "d0",
              words: 250,
            },
            {
              id: "c3",
              kind: "recap",
              title: "Recap",
              goal: "Remember",
              regions: [],
              diagram: null,
              words: 150,
            },
          ],
        });
      }
      const many = Array.from({ length: 5 }, (_, i) => ({
        say: `Beat ${i} explains the start function and how it hands the URL to parse before answering the request on the socket.`,
        show:
          i === 0
            ? {
                type: "title",
                heading: "HTTP server",
                bullets: ["routing", "parsing"],
              }
            : { type: "code", region: "R2", focus: [7, 9] },
      }));
      return `Here you go:\n\`\`\`json\n${JSON.stringify({ beats: many })}\n\`\`\``;
    });

    const script = await generateScript(ctx, chat);

    const planCalls = chat.mock.calls.filter(([prompt]) =>
      prompt.includes("planning a"),
    );
    expect(planCalls).toHaveLength(1);
    // Every chapter is written at least once; short ones get one expansion.
    expect(chat.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(script.source).toBe("llm");
    expect(script.chapters.map((c) => c.title)).toEqual([
      "Welcome",
      "The server",
      "Recap",
    ]);
    expect(script.chapters[1].beats).toHaveLength(5);
    expect(script.chapters[1].beats[1].visual).toMatchObject({
      kind: "code",
      path: "src/server.ts",
      focus: [7, 9],
    });
    expect(script.wordCount).toBeGreaterThan(200);
  });

  it("replaces a chapter whose writes fail with the deterministic chapter of the same kind", async () => {
    const ctx = contextOf();
    const chat = vi.fn(async (prompt: string) => {
      if (prompt.includes("planning a")) {
        return JSON.stringify({
          chapters: [
            {
              id: "c1",
              kind: "intro",
              title: "Welcome",
              goal: "",
              regions: [],
              words: 150,
            },
          ],
        });
      }
      throw new Error("model down");
    });

    const script = await generateScript(ctx, chat);

    expect(script.chapters[0].kind).toBe("intro");
    expect(script.chapters[0].beats.length).toBeGreaterThan(0);
    expect(script.chapters[script.chapters.length - 1].kind).toBe("recap");
  });

  it("throws when the plan itself is unusable so the caller can fall back", async () => {
    await expect(
      generateScript(contextOf(), async () => "no json here"),
    ).rejects.toThrow();
  });
});

describe("timeTutorial", () => {
  it("lays beats out back to back and sizes them from audio when present", () => {
    const script = buildDeterministicScript(contextOf());
    const firstBeat = script.chapters[0].beats[0];
    const audio = { [firstBeat.id]: { url: "blob:x", durationSeconds: 12 } };

    const timed = timeTutorial(script.chapters, audio, 30);

    expect(timed.chapters[0].startFrame).toBe(0);
    // The chapter card overlays the first beat instead of delaying it.
    expect(timed.chapters[0].beats[0].startFrame).toBe(0);
    expect(timed.chapters[0].beats[0].durationInFrames).toBe(
      Math.round(12.7 * 30),
    );
    const beats = timed.chapters.flatMap((c) => c.beats);
    for (let i = 1; i < beats.length; i += 1) {
      expect(beats[i].startFrame).toBeGreaterThanOrEqual(
        beats[i - 1].startFrame + beats[i - 1].durationInFrames,
      );
    }
    expect(timed.totalFrames).toBe(
      beats[beats.length - 1].startFrame +
        beats[beats.length - 1].durationInFrames,
    );
  });

  it("documents the eight-minute floor the script generator targets", () => {
    expect(MIN_TUTORIAL_WORDS).toBeGreaterThanOrEqual(8 * 145);
  });
});
