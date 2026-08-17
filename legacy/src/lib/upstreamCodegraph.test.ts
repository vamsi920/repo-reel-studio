import { describe, expect, it } from "vitest";

import {
  buildCodegraphQuestionContext,
  getCodegraphData,
  getRelevantCodegraphModules,
} from "@/lib/upstreamCodegraph";
import type { GitNexusGraphData } from "@/lib/types";

// Shaped like server/graphify_bridge.py's adapter output (Milestone 1),
// verified against the real `graphify` CLI: a "hub" file imported/called by
// two other files, plus an unrelated orphan file nothing references.
const graphifyGraphData: GitNexusGraphData = {
  nodes: [
    { id: "src_hub", name: "hub.ts", kind: "File", filePath: "src/hub.ts", cluster: "0" },
    { id: "src_hub_run", name: "run()", kind: "Function", filePath: "src/hub.ts", cluster: "0" },
    { id: "src_a", name: "a.ts", kind: "File", filePath: "src/a.ts", cluster: "1" },
    { id: "src_a_main", name: "main()", kind: "Function", filePath: "src/a.ts", cluster: "1" },
    { id: "src_b", name: "b.ts", kind: "File", filePath: "src/b.ts", cluster: "1" },
    { id: "src_b_go", name: "go()", kind: "Function", filePath: "src/b.ts", cluster: "1" },
    { id: "src_orphan", name: "orphan.ts", kind: "File", filePath: "src/orphan.ts" },
  ],
  edges: [
    { source: "src_a", target: "src_hub", type: "IMPORTS", confidence: 0.95 },
    { source: "src_a_main", target: "src_hub_run", type: "CALLS", confidence: 0.95 },
    { source: "src_b", target: "src_hub", type: "IMPORTS", confidence: 0.95 },
    { source: "src_b_go", target: "src_hub_run", type: "CALLS", confidence: 0.95 },
  ],
  clusters: [
    { id: "0", label: "Community 0", members: ["src_hub", "src_hub_run"] },
    { id: "1", label: "Community 1", members: ["src_a", "src_a_main", "src_b", "src_b_go"] },
  ],
  processes: [],
  summary: {
    repoName: "fixture",
    totalFiles: 4,
    totalSymbols: 7,
    totalEdges: 4,
    languages: {},
    entryPoints: [],
    hubFiles: [],
    keyTechnologies: ["graphify"],
  },
};

const nonGraphifyGraphData: GitNexusGraphData = {
  ...graphifyGraphData,
  summary: { ...graphifyGraphData.summary!, keyTechnologies: [] },
};

describe("upstreamCodegraph: Graphify-sourced graph data", () => {
  it("labels the synthesized codegraph engine as graphify when the source graph is graphify-tagged", () => {
    const codegraph = getCodegraphData(graphifyGraphData);
    expect(codegraph).not.toBeNull();
    expect(codegraph!.engine).toBe("graphify");
  });

  it("keeps the legacy engine label for non-graphify-sourced graph data", () => {
    const codegraph = getCodegraphData(nonGraphifyGraphData);
    expect(codegraph).not.toBeNull();
    expect(codegraph!.engine).toBe("xnuinside-codegraph");
  });

  it("computes real incoming/outgoing link counts from graph edges, not filename heuristics", () => {
    const codegraph = getCodegraphData(graphifyGraphData);
    const hub = codegraph!.moduleIndex.find((m) => m.fullPath === "src/hub.ts");
    const orphan = codegraph!.moduleIndex.find((m) => m.fullPath === "src/orphan.ts");
    expect(hub).toBeDefined();
    expect(orphan).toBeDefined();
    // hub.ts is imported by both a.ts and b.ts -- real edge-derived degree.
    expect(hub!.incomingLinks).toBeGreaterThanOrEqual(2);
    expect(orphan!.incomingLinks).toBe(0);
    expect(orphan!.outgoingLinks).toBe(0);
  });

  it("carries per-node community into the D3-consumable rawNodes for coloring", () => {
    const codegraph = getCodegraphData(graphifyGraphData);
    const hubModule = codegraph!.graph.nodes.find((n) => n.id === "module:src/hub.ts");
    const hubFn = codegraph!.graph.nodes.find((n) => n.fullPath === "src/hub.ts" && n.type === "entity");
    const aModule = codegraph!.graph.nodes.find((n) => n.id === "module:src/a.ts");
    expect(hubModule?.community).toBe("0");
    expect(hubFn?.community).toBe("0");
    expect(aModule?.community).toBe("1");
  });

  it("ranks the real graph hub above an unreferenced file for a generic query", () => {
    const modules = getRelevantCodegraphModules(graphifyGraphData, [], "general", 5);
    const hubIndex = modules.findIndex((m) => m.fullPath === "src/hub.ts");
    const orphanIndex = modules.findIndex((m) => m.fullPath === "src/orphan.ts");
    expect(hubIndex).toBeGreaterThanOrEqual(0);
    expect(orphanIndex).toBeGreaterThanOrEqual(0);
    expect(hubIndex).toBeLessThan(orphanIndex);
  });

  it("buildCodegraphQuestionContext returns non-empty, sane context for graphify-sourced data", () => {
    const context = buildCodegraphQuestionContext(graphifyGraphData, [], "general");
    expect(context).not.toBeNull();
    expect(context!.modules.length).toBeGreaterThan(0);
    expect(context!.stats.moduleCount).toBeGreaterThan(0);
  });

  it("returns null context when no graph data is available at all", () => {
    expect(buildCodegraphQuestionContext(null, [], "general")).toBeNull();
  });
});
