import { describe, expect, it } from "vitest";

import { buildCodegraphSrcDoc } from "@/lib/codegraphFrame";
import type { CodegraphEngineData } from "@/lib/types";

const fixtureCodegraph: CodegraphEngineData = {
  engine: "graphify",
  source: "gitnexus-fallback",
  generatedAt: new Date(0).toISOString(),
  graph: {
    nodes: [{ id: "module:a.ts", label: "a.ts", type: "module", fullPath: "a.ts" }],
    links: [],
    unlinkedModules: [],
  },
  moduleIndex: [],
  entityIndex: [],
  csvRows: [],
  stats: {
    pythonFileCount: 0,
    moduleCount: 1,
    entityCount: 0,
    externalCount: 0,
    linkCount: 0,
    unlinkedModuleCount: 1,
  },
  summary: { mostConnectedModules: [], hottestEntities: [], externalDependencies: [] },
};

describe("buildCodegraphSrcDoc: no network-loaded resources", () => {
  it("does not reference any external script or stylesheet URL", () => {
    const srcDoc = buildCodegraphSrcDoc(fixtureCodegraph);

    // The actual reliability concern is a resource-loading reference
    // (<script src="http...">, <link ... href="http...">) -- not a bare
    // "http" substring, which would also false-positive on the vendored
    // d3 bundle's SVG/XML namespace URIs (http://www.w3.org/2000/svg etc.)
    // and its "// https://d3js.org ..." copyright comment, neither of which
    // trigger a network request.
    expect(srcDoc).not.toMatch(/<script[^>]+src\s*=\s*["']https?:\/\//i);
    expect(srcDoc).not.toMatch(/<link[^>]+href\s*=\s*["']https?:\/\//i);
  });

  it("inlines the D3 bundle inside a bare <script> tag with no src attribute", () => {
    const srcDoc = buildCodegraphSrcDoc(fixtureCodegraph);
    expect(srcDoc).toContain("d3js.org v7"); // the vendored bundle's own header comment
    expect(srcDoc).not.toContain("/* D3_PLACEHOLDER */"); // placeholder must be substituted
  });

  it("still substitutes styles, graph data, and the node-click bridge script", () => {
    const srcDoc = buildCodegraphSrcDoc(fixtureCodegraph);
    expect(srcDoc).not.toContain("/* STYLES_PLACEHOLDER */");
    expect(srcDoc).not.toContain("/* GRAPH_DATA_PLACEHOLDER */");
    expect(srcDoc).not.toContain("/* SCRIPT_PLACEHOLDER */");
    expect(srcDoc).toContain("codegraph-node");
    expect(srcDoc).toContain("module:a.ts");
  });

  it("does not corrupt output when substituted content contains $&-style replacement patterns", () => {
    // String.prototype.replace() with a STRING replacement argument
    // special-cases "$&" (matched substring), "$`" / "$'" (pre/post-match),
    // and "$$" (literal $). Graph data is arbitrary repo-derived content
    // (e.g. a codeSnippet containing a template literal or regex) that can
    // easily contain these sequences by coincidence -- this broke for real
    // during development because the vendored d3 bundle itself contains a
    // literal "$&" inside a number-formatting helper, which silently
    // reinserted the placeholder marker text into the page. Regression test
    // for that whole class of bug, independent of the d3 bundle's exact
    // contents.
    const codegraphWithDollarPatterns: CodegraphEngineData = {
      ...fixtureCodegraph,
      graph: {
        nodes: [
          { id: "module:$&weird", label: "uses $& and $` and $' and $$ literally", type: "module", fullPath: "$&.ts" },
        ],
        links: [],
        unlinkedModules: [],
      },
    };
    const srcDoc = buildCodegraphSrcDoc(codegraphWithDollarPatterns);
    expect(srcDoc).toContain("uses $& and $` and $' and $$ literally");
    expect(srcDoc).not.toContain("/* GRAPH_DATA_PLACEHOLDER */");
    expect(srcDoc).not.toContain("/* D3_PLACEHOLDER */");
    expect(srcDoc).not.toContain("/* STYLES_PLACEHOLDER */");
    expect(srcDoc).not.toContain("/* SCRIPT_PLACEHOLDER */");
  });
});
