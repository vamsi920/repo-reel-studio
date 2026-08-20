import { describe, expect, it } from "vitest";
import {
  breadcrumbsFor,
  buildHierarchy,
  type SubsystemHint,
} from "#/lib/codegraph/hierarchy";
import type {
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
} from "../../../vendor/understand-anything/core/types";

function file(path: string): GraphNode {
  return {
    id: `file:${path}`,
    type: "file",
    name: path.slice(path.lastIndexOf("/") + 1),
    filePath: path,
    summary: "",
    tags: [],
    complexity: "simple",
  };
}

function fn(path: string, name: string): GraphNode {
  return {
    id: `function:${path}:${name}`,
    type: "function",
    name,
    filePath: path,
    summary: "",
    tags: [],
    complexity: "simple",
  };
}

function contains(from: string, to: string): GraphEdge {
  return {
    source: from,
    target: to,
    type: "contains",
    direction: "forward",
    weight: 1,
  };
}

function imports(from: string, to: string): GraphEdge {
  return {
    source: from,
    target: to,
    type: "imports",
    direction: "forward",
    weight: 0.6,
  };
}

function graphOf(nodes: GraphNode[], edges: GraphEdge[] = []): KnowledgeGraph {
  return {
    version: "1.0.0",
    project: {
      name: "demo",
      languages: ["typescript"],
      frameworks: [],
      description: "",
      analyzedAt: "2026-01-01T00:00:00.000Z",
      gitCommitHash: "abc1234",
    },
    nodes,
    edges,
    layers: [],
    tour: [],
  };
}

describe("buildHierarchy", () => {
  it("keeps the system view small enough to read, whatever the repo size", () => {
    // 300 files spread across 30 top-level folders — a flat render would be
    // unusable, which is the whole reason this aggregation exists.
    const nodes: GraphNode[] = [];
    for (let folder = 0; folder < 30; folder += 1) {
      for (let index = 0; index < 10; index += 1) {
        nodes.push(file(`area${folder}/nested/file${index}.ts`));
      }
    }

    const result = buildHierarchy(graphOf(nodes));
    const level1 = result.childrenByParent[""];

    expect(level1.length).toBe(30);
    for (const level of result.levels) {
      expect(level.nodes.length).toBeLessThanOrEqual(30);
    }
  });

  it("never renders more than the level budget, even for one huge flat folder", () => {
    // 400 files directly inside one folder: there is no deeper path segment to
    // split on, so the alphabetical fallback has to take over.
    const nodes = Array.from({ length: 400 }, (_, index) =>
      file(`src/flat/file${String(index).padStart(3, "0")}.ts`),
    );

    const result = buildHierarchy(graphOf(nodes));

    for (const level of result.levels) {
      expect(level.nodes.length).toBeLessThanOrEqual(30);
    }
    // Every file is still reachable — aggregation must not drop nodes.
    const units = Object.values(result.nodesById).filter(
      (node) => node.level === "unit",
    );
    expect(units).toHaveLength(400);
  });

  it("names subsystems from DeepWiki sections rather than folder names", () => {
    const nodes = [
      file("src/pay/charge.ts"),
      file("src/pay/refund.ts"),
      file("src/notify/email.ts"),
    ];
    const hints: SubsystemHint[] = [
      {
        id: "section-payments",
        title: "Payment Service",
        filePaths: ["src/pay/charge.ts", "src/pay/refund.ts"],
      },
    ];

    const result = buildHierarchy(graphOf(nodes), hints);
    const names = result.childrenByParent[""].map(
      (id) => result.nodesById[id].name,
    );

    expect(names).toContain("Payment Service");
    expect(names).not.toContain("pay");
  });

  it("gives a contested file to the more focused section, not the overview", () => {
    const nodes = [
      file("src/pay/webhooks/stripe.ts"),
      file("src/pay/charge.ts"),
    ];
    const hints: SubsystemHint[] = [
      {
        id: "overview",
        title: "Architecture Overview",
        // A sprawling page that cites most of the repo, including our file.
        filePaths: [
          "src/pay/webhooks/stripe.ts",
          "src/pay/charge.ts",
          "src/a.ts",
          "src/b.ts",
          "src/c.ts",
        ],
      },
      {
        id: "webhooks",
        title: "Webhooks",
        filePaths: ["./src/pay/webhooks/stripe.ts"],
      },
    ];

    const result = buildHierarchy(graphOf(nodes), hints);
    const owner = result.parentById["file:src/pay/webhooks/stripe.ts"];

    expect(result.nodesById[owner!].name).toBe("Webhooks");
    // The file the overview alone cites still lands under the overview.
    expect(
      result.nodesById[result.parentById["file:src/pay/charge.ts"]!].name,
    ).toBe("Architecture Overview");
  });

  it("falls back to detected layers before folders", () => {
    const nodes = [file("a/one.ts"), file("b/two.ts")];
    const graph = graphOf(nodes);
    graph.layers = [
      {
        id: "api",
        name: "API Layer",
        description: "",
        nodeIds: ["file:a/one.ts"],
      },
    ];

    const result = buildHierarchy(graph);
    const names = result.childrenByParent[""].map(
      (id) => result.nodesById[id].name,
    );

    expect(names).toContain("API Layer");
    expect(names).toContain("b");
  });

  it("nests functions under the file that contains them", () => {
    const target = file("src/a/service.ts");
    const one = fn("src/a/service.ts", "chargeCard");
    const two = fn("src/a/service.ts", "refund");
    const other = file("src/b/other.ts");

    const result = buildHierarchy(
      graphOf(
        [target, one, two, other],
        [contains(target.id, one.id), contains(target.id, two.id)],
      ),
    );

    expect(result.childrenByParent[target.id]).toEqual([one.id, two.id]);
    expect(result.nodesById[target.id].childCount).toBe(2);
    expect(result.nodesById[one.id].level).toBe("symbol");
    expect(result.nodesById[one.id].childCount).toBe(0);
    expect(result.parentById[one.id]).toBe(target.id);
  });

  it("lifts edges to the level being rendered and merges parallel ones", () => {
    const nodes = [
      file("api/a.ts"),
      file("api/b.ts"),
      file("data/c.ts"),
      file("data/d.ts"),
    ];
    const edges = [
      imports("file:api/a.ts", "file:data/c.ts"),
      imports("file:api/b.ts", "file:data/d.ts"),
    ];

    const result = buildHierarchy(graphOf(nodes, edges));
    const root = result.levels.find((level) => level.parentId === null)!;

    // Two file-to-file imports across the same pair of subsystems collapse into
    // a single edge that remembers it stands for two.
    expect(root.edges).toHaveLength(1);
    expect(root.edges[0].count).toBe(2);
    expect(root.nodes.map((node) => node.name).sort()).toEqual(["api", "data"]);
  });

  it("drops edges that would become self-loops after aggregation", () => {
    const nodes = [file("api/a.ts"), file("api/b.ts")];
    const result = buildHierarchy(
      graphOf(nodes, [imports("file:api/a.ts", "file:api/b.ts")]),
    );
    const root = result.levels.find((level) => level.parentId === null)!;

    expect(root.nodes).toHaveLength(1);
    expect(root.edges).toHaveLength(0);
  });

  it("counts files and symbols for the activity milestone", () => {
    const target = file("src/a.ts");
    const result = buildHierarchy(
      graphOf(
        [target, fn("src/a.ts", "one"), fn("src/a.ts", "two")],
        [contains(target.id, "function:src/a.ts:one")],
      ),
    );

    expect(result.fileCount).toBe(1);
    expect(result.symbolCount).toBe(2);
  });

  it("keeps a symbol reachable even when it cannot be attached to a file", () => {
    const orphan = fn("", "floating");
    orphan.filePath = undefined;

    const result = buildHierarchy(graphOf([orphan]));

    expect(result.nodesById[orphan.id]).toBeDefined();
  });
});

describe("breadcrumbsFor", () => {
  it("walks from the system root down to the node", () => {
    const nodesById = {
      sub: { name: "Payment Service" },
      mod: { name: "Processing" },
      leaf: { name: "PaymentService" },
    } as never;
    const parentById = { sub: null, mod: "sub", leaf: "mod" };

    expect(breadcrumbsFor("leaf", nodesById, parentById)).toEqual([
      { id: null, name: "System" },
      { id: "sub", name: "Payment Service" },
      { id: "mod", name: "Processing" },
      { id: "leaf", name: "PaymentService" },
    ]);
  });

  it("returns just the root for the system view", () => {
    expect(breadcrumbsFor(null, {}, {})).toEqual([
      { id: null, name: "System" },
    ]);
  });

  it("does not hang on a cyclic parent chain", () => {
    const nodesById = { a: { name: "A" }, b: { name: "B" } } as never;
    const parentById = { a: "b", b: "a" };

    expect(breadcrumbsFor("a", nodesById, parentById)).toHaveLength(3);
  });
});
