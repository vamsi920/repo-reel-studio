import { describe, expect, it } from "vitest";

import { buildEvidenceSummary } from "#/lib/knowledge/code-evidence";
import type { AnalysisHandle } from "#/lib/codegraph/analyzer-runner";
import type { CodeGraphNode } from "#/lib/codegraph/codegraph-types";

function node(id: string, fileCount: number): CodeGraphNode {
  return {
    id,
    level: "subsystem",
    type: "module",
    name: id,
    summary: "",
    complexity: "simple",
    tags: [],
    childCount: 0,
    filePaths: Array.from({ length: fileCount }, (_, i) => `${id}/file-${i}.ts`),
  };
}

function handleWithNodes(nodeCount: number, extraEdges: AnalysisHandle["root"]["edges"] = []): AnalysisHandle {
  // Descending file counts so `.sort()` keeps the input order — node-0 has
  // the most files, node-N the fewest, matching buildEvidenceSummary's own
  // "most files first" truncation.
  const nodes = Array.from({ length: nodeCount }, (_, i) =>
    node(`node-${i}`, nodeCount - i),
  );
  return {
    meta: {
      workspaceId: "ws",
      repositoryId: "acme/widgets",
      commitSha: "abc123",
      generatedAt: new Date().toISOString(),
      fileCount: 100,
      symbolCount: 200,
      languages: ["TypeScript"],
      frameworks: [],
    },
    root: { parentId: null, nodes, edges: extraEdges, crumbs: [] },
    loadLevel: async () => null,
    loadSearchIndex: async () => [],
    readSource: async () => null,
  };
}

describe("buildEvidenceSummary", () => {
  it("never emits an edge whose endpoint is outside the truncated subsystems list", () => {
    // 25 subsystems, but only the top 20 (by file count) survive truncation —
    // node-20..node-24 are dropped. An edge referencing one of those must not
    // leak into subsystemEdges even though it's a "real" edge in the graph.
    const handle = handleWithNodes(25, [
      { source: "node-0", target: "node-1", type: "imports", weight: 1, count: 3 },
      { source: "node-0", target: "node-24", type: "imports", weight: 1, count: 1 },
    ]);

    const summary = buildEvidenceSummary(handle);

    expect(summary.subsystems).toHaveLength(20);
    const subsystemNames = new Set(summary.subsystems.map((s) => s.name));
    expect(subsystemNames.has("node-24")).toBe(false);

    for (const edge of summary.subsystemEdges) {
      expect(subsystemNames.has(edge.from)).toBe(true);
      expect(subsystemNames.has(edge.to)).toBe(true);
    }
    // The dropped-endpoint edge must be excluded entirely, not half-kept.
    expect(
      summary.subsystemEdges.some((e) => e.from === "node-0" && e.to === "node-24"),
    ).toBe(false);
    expect(
      summary.subsystemEdges.some((e) => e.from === "node-0" && e.to === "node-1"),
    ).toBe(true);

    // The rendered prompt text must not name a subsystem it never introduced.
    expect(summary.rendered).not.toContain("node-24");
  });

  it("keeps every edge when the repository has 20 or fewer subsystems", () => {
    const handle = handleWithNodes(5, [
      { source: "node-0", target: "node-4", type: "imports", weight: 1, count: 2 },
    ]);

    const summary = buildEvidenceSummary(handle);

    expect(summary.subsystems).toHaveLength(5);
    expect(summary.subsystemEdges).toHaveLength(1);
    expect(summary.subsystemEdges[0]).toMatchObject({
      from: "node-0",
      to: "node-4",
      count: 2,
    });
  });
});
