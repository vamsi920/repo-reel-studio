import { describe, expect, it } from "vitest";
import {
  breadcrumbsFor,
  buildHierarchy,
  MAX_LEVEL_CHILDREN,
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

function fn(
  path: string,
  name: string,
  lineRange?: [number, number],
): GraphNode {
  return {
    id: `function:${path}:${name}`,
    type: "function",
    name,
    filePath: path,
    lineRange,
    summary: "",
    tags: [],
    complexity: "simple",
  };
}

function cls(path: string, name: string, lineRange: [number, number]): GraphNode {
  return {
    id: `class:${path}:${name}`,
    type: "class",
    name,
    filePath: path,
    lineRange,
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

    for (const level of result.levels) {
      expect(level.nodes.length).toBeLessThanOrEqual(MAX_LEVEL_CHILDREN);
    }
    // Every file is still reachable — folding the overflow folders into
    // "Other" must not drop any of them.
    const units = Object.values(result.nodesById).filter(
      (node) => node.level === "unit",
    );
    expect(units).toHaveLength(300);
  });

  it("caps the number of level-1 subsystems, folding the smallest into Other", () => {
    // 40 detected architectural layers is more than MAX_LEVEL_CHILDREN — the
    // root/system view has no further level above it to split into, so the
    // overflow buckets fold together instead of blowing the budget.
    const nodes: GraphNode[] = [];
    const layers: KnowledgeGraph["layers"] = [];
    for (let index = 0; index < 40; index += 1) {
      const node = file(`layer${index}/one.ts`);
      nodes.push(node);
      layers.push({
        id: `layer-${index}`,
        name: `Layer ${index}`,
        description: "",
        nodeIds: [node.id],
      });
    }

    const graph = graphOf(nodes);
    graph.layers = layers;
    const result = buildHierarchy(graph);
    const level1 = result.childrenByParent[""];

    expect(level1.length).toBe(MAX_LEVEL_CHILDREN);
    const other = level1
      .map((id) => result.nodesById[id])
      .find((node) => node.name === "Other");
    expect(other).toBeDefined();
    expect(other!.childCount).toBe(40 - (MAX_LEVEL_CHILDREN - 1));

    // Still fully reachable — folded into Other, never dropped.
    const units = Object.values(result.nodesById).filter(
      (node) => node.level === "unit",
    );
    expect(units).toHaveLength(40);
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

  it("does not merge two sibling folders whose names collide after slugging", () => {
    // "Foo-Bar" and "foo_bar" both reduce to the same `foo-bar` slug, so the
    // module ids `buildModuleTree` derives from them would collide unless
    // deduped -- corrupting one aggregate with the other's children.
    const collisionA = [file("src/Foo-Bar/a.ts"), file("src/Foo-Bar/b.ts")];
    const collisionB = [file("src/foo_bar/c.ts"), file("src/foo_bar/d.ts")];
    // Padding pushes the folder past the level budget so the real
    // folder-splitting path (not "just attach everything") is exercised.
    const padding = Array.from({ length: 25 }, (_, index) =>
      file(`src/pad${index}/only.ts`),
    );
    const nodes = [...collisionA, ...collisionB, ...padding];
    const graph = graphOf(nodes);
    // One shared layer keeps every file in a single subsystem bucket, so the
    // two colliding folders are guaranteed to be siblings inside the same
    // `buildModuleTree` call.
    graph.layers = [
      {
        id: "svc",
        name: "Service",
        description: "",
        nodeIds: nodes.map((node) => node.id),
      },
    ];

    const result = buildHierarchy(graph);
    const subsystemId = result.childrenByParent[""][0];
    const moduleIds = result.childrenByParent[subsystemId].filter((id) =>
      id.includes("/module:"),
    );
    const moduleNames = moduleIds.map((id) => result.nodesById[id].name);

    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    expect(moduleNames).toContain("Foo-Bar");
    expect(moduleNames).toContain("foo_bar");

    const fooBarId = moduleIds[moduleNames.indexOf("Foo-Bar")];
    const fooBarUnderscoreId = moduleIds[moduleNames.indexOf("foo_bar")];
    expect(fooBarId).not.toBe(fooBarUnderscoreId);
    expect(result.nodesById[fooBarId].filePaths.slice().sort()).toEqual([
      "src/Foo-Bar/a.ts",
      "src/Foo-Bar/b.ts",
    ]);
    expect(
      result.nodesById[fooBarUnderscoreId].filePaths.slice().sort(),
    ).toEqual(["src/foo_bar/c.ts", "src/foo_bar/d.ts"]);
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

  it("keeps real folder-mates in the same subsystem even when hints disagree", () => {
    // Two files that really do live together under src/pay/ must land in
    // the SAME level-1 box — membership is decided by code structure, never
    // by which DeepWiki page happens to cite a file. Only the box's label
    // may come from a hint, and only when it substantially overlaps the
    // box's real (already-settled) membership.
    const nodes = [
      file("src/pay/webhooks/stripe.ts"),
      file("src/pay/charge.ts"),
    ];
    const hints: SubsystemHint[] = [
      {
        id: "overview",
        title: "Architecture Overview",
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
    const stripeOwner = result.parentById["file:src/pay/webhooks/stripe.ts"];
    const chargeOwner = result.parentById["file:src/pay/charge.ts"];

    // Same real folder → same subsystem box, regardless of hint disagreement.
    expect(stripeOwner).toBe(chargeOwner);
    // The winning label is whichever hint overlaps the box's real files
    // more (here, "Architecture Overview" claims both files; "Webhooks"
    // claims only one) — never a per-file split.
    expect(result.nodesById[stripeOwner!].name).toBe("Architecture Overview");
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

  it("nests a method under its class, not the file, even though the analyzer only ever emits a file->method `contains` edge", () => {
    // Mirrors vendor/understand-anything's graph-builder.ts: every function
    // (including class methods, for the extractors that surface them, e.g.
    // Java) gets a `contains` edge from the *file*, never from its class.
    const target = file("src/a/service.ts");
    const service = cls("src/a/service.ts", "PaymentService", [10, 40]);
    const method = fn("src/a/service.ts", "chargeCard", [12, 20]);

    const result = buildHierarchy(
      graphOf(
        [target, service, method],
        [contains(target.id, service.id), contains(target.id, method.id)],
      ),
    );

    expect(result.parentById[method.id]).toBe(service.id);
    expect(result.nodesById[service.id].childCount).toBe(1);
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

  it("clusters more than one level's worth of pathless symbols by connectivity", () => {
    // 30 orphan symbols with no file path can't be folder-split, so above the
    // level budget this must fall through to the vendored connectivity
    // clustering -- and a truly isolated symbol among them must still land
    // somewhere rather than vanish.
    const paired: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    for (let i = 0; i < 15; i += 1) {
      const a = fn("", `paired-${i}-a`);
      const b = fn("", `paired-${i}-b`);
      a.filePath = undefined;
      b.filePath = undefined;
      paired.push(a, b);
      edges.push({
        source: a.id,
        target: b.id,
        type: "calls",
        direction: "forward",
        weight: 1,
      });
    }
    const isolated = fn("", "isolated");
    isolated.filePath = undefined;

    const result = buildHierarchy(graphOf([...paired, isolated], edges));

    // Nothing dropped: every one of the 31 symbols is still reachable.
    for (const node of [...paired, isolated]) {
      expect(result.nodesById[node.id]).toBeDefined();
    }

    const subsystemId = result.childrenByParent[""][0];
    // The connected pairs earn their own module boxes...
    const moduleChildren = result.childrenByParent[subsystemId].filter(
      (id) => result.nodesById[id].level === "module",
    );
    expect(moduleChildren.length).toBeGreaterThan(0);
    // ...but the isolated symbol, having no pair, is not worth a box of its
    // own and is attached directly under the subsystem instead.
    expect(result.parentById[isolated.id]).toBe(subsystemId);
  });

  it("still attaches files sitting directly in a folder once its subfolders are split out", () => {
    // A folder with both loose files and several sub-packages, past the
    // level budget: each sub-package earns a module box, and the loose files
    // -- too few to need one of their own -- attach straight under the
    // folder instead of disappearing.
    const direct = [file("root/one.ts"), file("root/two.ts")];
    const packaged: GraphNode[] = [];
    for (let i = 0; i < 25; i += 1) {
      packaged.push(file(`root/pkg${i}/a.ts`), file(`root/pkg${i}/b.ts`));
    }
    const nodes = [...direct, ...packaged];
    const graph = graphOf(nodes);
    // One shared layer forces every file into a single subsystem bucket, so
    // `buildModuleTree`'s own folder-splitting (not the level-1 grouping)
    // is what's under test.
    graph.layers = [
      {
        id: "root-svc",
        name: "Root",
        description: "",
        nodeIds: nodes.map((node) => node.id),
      },
    ];

    const result = buildHierarchy(graph);
    const subsystemId = result.childrenByParent[""][0];

    for (const node of direct) {
      // Attached straight under the subsystem, not nested inside a module.
      expect(result.parentById[node.id]).toBe(subsystemId);
    }
    const moduleChildren = result.childrenByParent[subsystemId].filter(
      (id) => result.nodesById[id].level === "module",
    );
    expect(moduleChildren.length).toBe(25);
  });

  it("buckets a lone root-level file under 'Other' when there are too few nodes to cluster", () => {
    // A single file with no directory segment and no detected layer: too few
    // nodes (< the connectivity-clustering minimum) to run folder/community
    // grouping, so it must still land in the generic "Other" bucket rather
    // than being dropped.
    const result = buildHierarchy(graphOf([file("index.ts")]));
    const subsystemId = result.childrenByParent[""][0];

    expect(result.nodesById[subsystemId].name).toBe("Other");
    expect(result.parentById["file:index.ts"]).toBeDefined();
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
