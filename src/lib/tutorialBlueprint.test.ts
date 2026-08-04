import { describe, expect, it } from "vitest";

import {
  buildGraphTutorialBlueprint,
  buildManifestFromBlueprint,
  buildTutorialContextDigest,
  mergeManifestWithBlueprint,
  type GraphTutorialBlueprint,
} from "@/lib/tutorialBlueprint";
import type { GitNexusGraphData, VideoManifest } from "@/lib/types";

const lines = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix} ${i}`).join("\n");

const fileContents: Record<string, string> = {
  "README.md": ["# demo", "", "Demo repository for tests.", lines("docs", 20)].join("\n"),
  "package.json": '{ "name": "demo" }',
  "src/main.ts": ["export function bootstrap() {", "  return true;", "}", lines("// main", 60)].join("\n"),
  "src/server/service.ts": ["export class Service {}", lines("// service", 80)].join("\n"),
  "src/utils/format.ts": ["export const format = (v: string) => v;", lines("// fmt", 40)].join("\n"),
  "src/utils/format.test.ts": ["it('formats', () => {});", lines("// test", 15)].join("\n"),
};

const graph = {
  nodes: [
    { id: "file:src/main.ts", name: "main.ts", kind: "File", filePath: "src/main.ts" },
    {
      id: "sym:bootstrap",
      name: "bootstrap",
      kind: "Function",
      filePath: "src/main.ts",
      complexity: 8,
      docstring: "Boots the app. Wires the server.",
      startLine: 1,
      endLine: 3,
    },
    { id: "file:src/server/service.ts", name: "service.ts", kind: "File", filePath: "src/server/service.ts" },
    {
      id: "sym:Service",
      name: "Service",
      kind: "Class",
      filePath: "src/server/service.ts",
      complexity: 12,
      startLine: 1,
      endLine: 1,
    },
    { id: "file:src/utils/format.ts", name: "format.ts", kind: "File", filePath: "src/utils/format.ts" },
  ],
  edges: [
    { source: "file:src/main.ts", target: "file:src/server/service.ts", type: "IMPORTS" },
    { source: "file:src/server/service.ts", target: "file:src/utils/format.ts", type: "IMPORTS" },
  ],
  clusters: [
    { id: "cluster-app", label: "App Shell", kind: "app", members: ["file:src/main.ts"], fileCount: 1 },
    {
      id: "cluster-service",
      label: "Service Layer",
      kind: "service",
      description: "Server side services",
      members: ["file:src/server/service.ts", "file:src/utils/format.ts"],
      fileCount: 2,
      totalLines: 120,
    },
  ],
  processes: [
    {
      id: "process-boot",
      name: "Boot Sequence",
      description: "How the app starts",
      steps: [
        { symbolName: "bootstrap", filePath: "src/main.ts", stepIndex: 0 },
        { symbolName: "Service", filePath: "src/server/service.ts", stepIndex: 1 },
      ],
    },
  ],
  summary: {
    repoName: "demo",
    totalFiles: 6,
    totalSymbols: 5,
    totalEdges: 2,
    languages: { TypeScript: 5 },
    entryPoints: ["src/main.ts"],
    hubFiles: ["src/server/service.ts"],
    architecturePattern: "layered",
    keyTechnologies: ["TypeScript", "Node"],
    readmeSummary: "Demo repository for tests.",
  },
} as unknown as GitNexusGraphData;

const buildBlueprint = () =>
  buildGraphTutorialBlueprint(graph, fileContents, "demo") as GraphTutorialBlueprint;

describe("buildGraphTutorialBlueprint", () => {
  it("returns null without a graph or files", () => {
    expect(buildGraphTutorialBlueprint(null, fileContents, "demo")).toBeNull();
    expect(buildGraphTutorialBlueprint({ ...graph, nodes: [] }, fileContents, "demo")).toBeNull();
    expect(buildGraphTutorialBlueprint(graph, {}, "demo")).toBeNull();
  });

  it("plans a hook, architecture, flow, deep dive, details and conclusion arc", () => {
    const blueprint = buildBlueprint();
    const phases = blueprint.scenePlan.map((scene) => scene.phase);

    expect(phases[0]).toBe("hook");
    expect(phases.at(-1)).toBe("conclusion");
    expect(phases).toContain("architecture");
    expect(phases).toContain("flow");
    expect(phases).toContain("deep_dive");
    expect(phases).toContain("details");
  });

  it("only references real repository files", () => {
    const blueprint = buildBlueprint();

    expect(blueprint.repoFiles).toEqual(Object.keys(fileContents).sort());
    blueprint.scenePlan.forEach((scene) => {
      expect(blueprint.repoFiles).toContain(scene.filePath);
    });
    expect(blueprint.selectedFiles.length).toBeGreaterThan(1);
  });

  it("summarizes the repo and sums the suggested duration", () => {
    const blueprint = buildBlueprint();

    expect(blueprint.title).toBe("demo Walkthrough");
    expect(blueprint.overview).toContain("Architecture: layered");
    expect(blueprint.overview).toContain("Technologies: TypeScript, Node");
    expect(blueprint.suggestedDurationSeconds).toBe(
      blueprint.scenePlan.reduce((sum, scene) => sum + scene.durationSeconds, 0)
    );
  });

  it("attaches mermaid diagrams to the architecture and flow scenes", () => {
    const blueprint = buildBlueprint();
    const architecture = blueprint.scenePlan.find((scene) => scene.id === "architecture-map");
    const flow = blueprint.scenePlan.find((scene) => scene.id === "runtime-flow");

    expect(architecture?.diagram?.mermaid).toContain("flowchart");
    expect(architecture?.diagram?.mermaid).toContain("Service Layer");
    expect(architecture?.visualType).toBe("diagram");
    expect(flow?.diagram?.mermaid?.length).toBeGreaterThan(0);
    expect(flow?.bulletPoints[0]).toContain("Step 1");
  });

  it("keeps highlight lines inside the real file bounds", () => {
    const blueprint = buildBlueprint();

    blueprint.scenePlan.forEach((scene) => {
      if (!scene.highlightLines) return;
      const [start, end] = scene.highlightLines;
      const total = fileContents[scene.filePath].split("\n").length;
      expect(start).toBeGreaterThanOrEqual(1);
      expect(end).toBeGreaterThanOrEqual(start);
      expect(end).toBeLessThanOrEqual(total);
    });
  });

  it("skips the flow scene when no process has enough steps", () => {
    const blueprint = buildGraphTutorialBlueprint(
      { ...graph, processes: [{ name: "Too short", steps: [{ symbolName: "a", filePath: "src/main.ts", stepIndex: 0 }] }] },
      fileContents,
      "demo"
    ) as GraphTutorialBlueprint;

    expect(blueprint.scenePlan.some((scene) => scene.phase === "flow")).toBe(false);
  });
});

describe("buildManifestFromBlueprint", () => {
  it("turns each planned scene into a narrated manifest scene", () => {
    const blueprint = buildBlueprint();
    const manifest = buildManifestFromBlueprint(blueprint, "demo");

    expect(manifest.title).toBe("demo Walkthrough");
    expect(manifest.repo_files).toEqual(blueprint.repoFiles);
    expect(manifest.scenes).toHaveLength(blueprint.scenePlan.length);
    expect(manifest.scenes.map((scene) => scene.id)).toEqual(
      blueprint.scenePlan.map((_, index) => index + 1)
    );
    manifest.scenes.forEach((scene, index) => {
      expect(scene.file_path).toBe(blueprint.scenePlan[index].filePath);
      expect(scene.phase).toBe(blueprint.scenePlan[index].phase);
      expect(scene.code).toBe("");
      expect(scene.narration_text.length).toBeGreaterThan(0);
      expect(scene.duration_seconds).toBeGreaterThanOrEqual(
        blueprint.scenePlan[index].durationSeconds
      );
    });
  });

  it("falls back to a repo-derived title when the blueprint has none", () => {
    const blueprint = { ...buildBlueprint(), title: "" };

    expect(buildManifestFromBlueprint(blueprint, "demo").title).toBe("demo Walkthrough");
  });
});

describe("mergeManifestWithBlueprint", () => {
  const meaningfulNarration =
    "This scene explains, in more than eighteen words, exactly how the bootstrap function wires the server together for the reader following along.";

  it("keeps candidate narration and titles when they are meaningful", () => {
    const blueprint = buildBlueprint();
    const candidate: VideoManifest = {
      title: "LLM title",
      scenes: [
        {
          id: 1,
          type: "intro",
          phase: "hook",
          file_path: blueprint.scenePlan[0].filePath,
          title: "A Real Human Title",
          narration_text: meaningfulNarration,
          duration_seconds: 4,
          bullet_points: ["Candidate bullet"],
          focus_symbols: ["bootstrap"],
        },
      ],
    };

    const merged = mergeManifestWithBlueprint(candidate, blueprint, fileContents, "demo");

    expect(merged.title).toBe("LLM title");
    expect(merged.scenes).toHaveLength(blueprint.scenePlan.length);
    expect(merged.scenes[0].title).toBe("A Real Human Title");
    expect(merged.scenes[0].narration_text).toBe(meaningfulNarration);
    expect(merged.scenes[0].bullet_points?.[0]).toBe("Candidate bullet");
    expect(merged.scenes[0].bullet_points?.length).toBeLessThanOrEqual(4);
  });

  it("replaces thin narration and generic titles with the blueprint fallback", () => {
    const blueprint = buildBlueprint();
    const fallback = buildManifestFromBlueprint(blueprint, "demo");
    const candidate: VideoManifest = {
      title: "",
      scenes: [
        {
          id: 1,
          type: "intro",
          phase: "hook",
          file_path: blueprint.scenePlan[0].filePath,
          title: "Scene 1",
          narration_text: "too short",
          duration_seconds: 1,
        },
      ],
    };

    const merged = mergeManifestWithBlueprint(candidate, blueprint, fileContents, "demo");

    expect(merged.title).toBe(fallback.title);
    expect(merged.scenes[0].title).toBe(fallback.scenes[0].title);
    expect(merged.scenes[0].narration_text).toBe(fallback.scenes[0].narration_text);
  });

  it("clamps candidate highlight lines to the real file length", () => {
    const blueprint = buildBlueprint();
    const filePath = blueprint.scenePlan[0].filePath;
    const candidate: VideoManifest = {
      title: "LLM title",
      scenes: [
        {
          id: 1,
          type: "intro",
          phase: "hook",
          file_path: filePath,
          title: "A Real Human Title",
          narration_text: meaningfulNarration,
          duration_seconds: 4,
          highlight_lines: [0, 9999],
        },
      ],
    };

    const merged = mergeManifestWithBlueprint(candidate, blueprint, fileContents, "demo");
    const total = fileContents[filePath].split("\n").length;

    expect(merged.scenes[0].highlight_lines?.[0]).toBeGreaterThanOrEqual(1);
    expect(merged.scenes[0].highlight_lines?.[1]).toBeLessThanOrEqual(total);
  });

  it("tolerates a candidate manifest with no usable scenes", () => {
    const blueprint = buildBlueprint();
    const fallback = buildManifestFromBlueprint(blueprint, "demo");
    const merged = mergeManifestWithBlueprint(
      { title: "", scenes: undefined as unknown as VideoManifest["scenes"] },
      blueprint,
      fileContents,
      "demo"
    );

    expect(merged.scenes.map((scene) => scene.title)).toEqual(
      fallback.scenes.map((scene) => scene.title)
    );
  });
});

describe("buildTutorialContextDigest", () => {
  it("includes the file list, the plan and code excerpts", () => {
    const blueprint = buildBlueprint();
    const digest = buildTutorialContextDigest(blueprint, fileContents, 20_000);

    expect(digest).toContain("FILES:");
    expect(digest).toContain("GRAPH-BACKED TUTORIAL PLAN:");
    expect(digest).toContain("SCENE-FOCUSED EXCERPTS:");
    expect(digest).toContain("src/main.ts");
    expect(digest).toContain("export function bootstrap()");
  });

  it("truncates when the digest exceeds the character budget", () => {
    const blueprint = buildBlueprint();
    const digest = buildTutorialContextDigest(blueprint, fileContents, 300);

    expect(digest).toContain("... (truncated)");
    expect(digest.length).toBeLessThan(400);
  });
});
