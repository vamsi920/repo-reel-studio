import { describe, expect, it } from "vitest";

import { buildCodegraphSrcDoc } from "@/lib/codegraphFrame";
import type { CodegraphEngineData } from "@/lib/types";

const codegraph = {
  engine: "xnuinside-codegraph",
  generatedAt: "2024-01-01T00:00:00.000Z",
  graph: {
    nodes: [{ id: "mod:app", label: "</script>" }],
    links: [],
    unlinkedModules: [],
  },
  moduleIndex: [],
  entityIndex: [],
  csvRows: [],
  stats: {
    pythonFileCount: 1,
    moduleCount: 1,
    entityCount: 0,
    externalCount: 0,
    linkCount: 0,
    unlinkedModuleCount: 0,
  },
  summary: {},
} as unknown as CodegraphEngineData;

describe("buildCodegraphSrcDoc", () => {
  it("inlines styles, graph data and scripts into the template", () => {
    const srcDoc = buildCodegraphSrcDoc(codegraph);

    expect(srcDoc).not.toContain("/* STYLES_PLACEHOLDER */");
    expect(srcDoc).not.toContain("/* GRAPH_DATA_PLACEHOLDER */");
    expect(srcDoc).not.toContain("/* SCRIPT_PLACEHOLDER */");
    expect(srcDoc).toContain('"mod:app"');
    expect(srcDoc).toContain("codegraph-node");
  });

  it("escapes closing tags inside the serialized graph", () => {
    const srcDoc = buildCodegraphSrcDoc(codegraph);
    const graphLine = srcDoc.split("\n").find((line) => line.includes('"mod:app"')) ?? "";

    expect(graphLine).not.toContain("</script>");
    expect(graphLine).toContain("<\\\\/script>");
  });
});
