/**
 * Builds the drill-down tree that makes a large repository understandable at
 * first glance.
 *
 * A raw Understand-Anything graph is flat: thousands of file/class/function
 * nodes plus detected architectural `layers`. Rendering that directly is the
 * exact failure mode this feature exists to avoid, so we aggregate it into:
 *
 *   System > Subsystem > Module > File/Class > Function
 *
 * with extra module levels inserted wherever a folder is too big to show at
 * once, so **no level ever renders more than `MAX_LEVEL_CHILDREN` nodes**.
 *
 * Two grouping strategies are used, in this order:
 *
 *  1. **Folder segments** — the primary strategy, because it is inherently
 *     hierarchical: each level splits on the next path segment below its
 *     parent's prefix, so drilling down mirrors the repository's own shape and
 *     is stable across analyses.
 *  2. **Vendored `deriveContainers`** (folder longest-common-prefix, falling
 *     back to Louvain communities) — used only for nodes that have no file
 *     path to split on, where upstream's connectivity-based clustering is the
 *     better answer.
 *
 * Subsystem *membership* at level 1 always comes from real code structure —
 * Understand-Anything's detected architectural layers first, falling back to
 * top-level folders — never from which DeepWiki section happens to cite a
 * file. Knowledge is supporting metadata for this graph, not its source.
 * Subsystem *naming* only, separately, prefers a DeepWiki section title when
 * one substantially overlaps an already-formed bucket's real files: DeepWiki
 * already named this repository's architecture in product terms ("Payment
 * Service"), which reads far better than the folder name `src/pay` — but the
 * bucket's contents were never decided by that title.
 *
 * This module is pure — same graph in, same tree out — and runs both bundled
 * into the sandbox analyzer and directly in tests.
 */
import type {
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
  NodeType,
} from "../../../vendor/understand-anything/core/types";
import { deriveContainers } from "../../../vendor/understand-anything/dashboard/utils/containers";
import type {
  CodeGraphCrumb,
  CodeGraphEdge,
  CodeGraphLevel,
  CodeGraphLevelKind,
  CodeGraphNode,
} from "./codegraph-types";

/**
 * A DeepWiki section reduced to the only two things subsystem naming needs.
 * Passed as plain data so this module never imports the Knowledge engine — the
 * analyzer that calls it runs in a sandbox with no access to it.
 */
export interface SubsystemHint {
  id: string;
  title: string;
  /** Every source file DeepWiki's pages in this section cite. */
  filePaths: string[];
}

/** Node types that represent a leaf symbol (the deepest level). */
const SYMBOL_TYPES = new Set<NodeType>(["function", "step"]);

/**
 * The readability budget. Any group larger than this is split into a further
 * module level rather than dumped onto one canvas — this is what stops a
 * "misc" bucket from becoming an 898-node wall.
 */
const MAX_LEVEL_CHILDREN = 24;

/**
 * Cap on how many file paths an aggregate node reports. Aggregates exist to
 * summarise; a subsystem listing 4,000 paths would defeat that and bloat the
 * shard the browser downloads.
 */
const MAX_AGGREGATE_FILE_PATHS = 50;

export interface HierarchyResult {
  /** Every node in the tree, aggregates included, keyed by id. */
  nodesById: Record<string, CodeGraphNode>;
  /** Child ids per parent. The system root is keyed by the empty string. */
  childrenByParent: Record<string, string[]>;
  /** Parent id per node; `null` for level-1 subsystems. */
  parentById: Record<string, string | null>;
  /** One pre-computed level per parent, ready to render or shard to disk. */
  levels: CodeGraphLevel[];
  fileCount: number;
  symbolCount: number;
}

const ROOT = "";

function isSymbol(node: GraphNode): boolean {
  return SYMBOL_TYPES.has(node.type);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unnamed"
  );
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/+/, "");
}

/** Directory portion of a path, without a trailing slash. */
function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash) : "";
}

/**
 * Longest common directory prefix, always ending at a `/` boundary (or empty).
 * Used so a group splits on the first segment that actually differs rather
 * than on a shared root everyone has.
 */
function commonDirPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  const dirs = paths.map(dirOf);
  let prefix = dirs[0];
  for (const dir of dirs) {
    while (prefix && !(dir === prefix || dir.startsWith(`${prefix}/`))) {
      const slash = prefix.lastIndexOf("/");
      prefix = slash >= 0 ? prefix.slice(0, slash) : "";
    }
    if (!prefix) return "";
  }
  return prefix ? `${prefix}/` : "";
}

/**
 * Assigns units to subsystems using DeepWiki's file citations.
 *
 * A file is often cited by more than one section — a broad "Architecture
 * Overview" page tends to cite half the repository. Ties therefore break toward
 * the *most focused* section: the one citing fewer files overall. That keeps
 * `src/payments/webhooks/stripe.ts` under "Webhooks" rather than letting a
 * sprawling overview swallow it, which would collapse the whole system view
 * into one giant subsystem.
 */
const HINT_LABEL_OVERLAP_THRESHOLD = 0.5;

/**
 * Relabels level-1 buckets in place with a DeepWiki section title, when one
 * substantially overlaps the bucket's real (already-determined) file
 * membership. This never changes which files belong in which bucket — only
 * the display name — so the graph's top level stays grounded in real code
 * structure (detected layers, then folders) even when Knowledge data is
 * generic, missing, or simply doesn't exist yet for this commit.
 */
function relabelBucketsWithHints(
  buckets: Map<string, { name: string; nodes: GraphNode[] }>,
  hints: SubsystemHint[],
): void {
  if (!hints.length) return;
  const hintFileSets = hints
    .map((hint) => ({
      title: hint.title,
      files: new Set(hint.filePaths.map(normalizePath)),
    }))
    .filter((hint) => hint.files.size > 0);
  if (!hintFileSets.length) return;

  for (const bucket of buckets.values()) {
    const bucketFiles = bucket.nodes
      .map((node) => (node.filePath ? normalizePath(node.filePath) : null))
      .filter((path): path is string => path !== null);
    if (!bucketFiles.length) continue;

    let best: { title: string; overlap: number } | null = null;
    for (const hint of hintFileSets) {
      const matched = bucketFiles.filter((path) => hint.files.has(path)).length;
      const overlap = matched / bucketFiles.length;
      if (
        overlap >= HINT_LABEL_OVERLAP_THRESHOLD &&
        (!best || overlap > best.overlap)
      ) {
        best = { title: hint.title, overlap };
      }
    }
    if (best) bucket.name = best.title;
  }
}

function aggregateFilePaths(nodes: CodeGraphNode[]): string[] {
  const seen = new Set<string>();
  for (const node of nodes) {
    for (const path of node.filePaths) {
      if (seen.size >= MAX_AGGREGATE_FILE_PATHS) return [...seen];
      seen.add(path);
    }
  }
  return [...seen];
}

function toCodeGraphNode(
  node: GraphNode,
  level: CodeGraphLevelKind,
  childCount: number,
  layer?: { id: string; name: string },
): CodeGraphNode {
  return {
    id: node.id,
    level,
    type: node.type,
    name: node.name,
    summary: node.summary ?? "",
    complexity: node.complexity ?? "simple",
    tags: node.tags ?? [],
    ...(node.filePath ? { filePath: normalizePath(node.filePath) } : {}),
    ...(node.lineRange ? { lineRange: node.lineRange } : {}),
    childCount,
    filePaths: node.filePath ? [normalizePath(node.filePath)] : [],
    ...(layer ? { layerId: layer.id, layerName: layer.name } : {}),
  };
}

/**
 * Lifts the raw edge list to one level: each endpoint is replaced by its
 * visible ancestor, self-loops are dropped, and parallel edges merge into one
 * weighted edge carrying a `count`. Without this a level would either show no
 * edges at all, or one edge per underlying call.
 */
function liftEdges(
  edges: GraphEdge[],
  ancestorOf: (nodeId: string) => string | undefined,
): CodeGraphEdge[] {
  const merged = new Map<string, CodeGraphEdge>();

  for (const edge of edges) {
    const source = ancestorOf(edge.source);
    const target = ancestorOf(edge.target);
    if (!source || !target || source === target) continue;

    const key = `${source} ${target} ${edge.type}`;
    const existing = merged.get(key);
    if (existing) {
      existing.weight = Math.min(1, existing.weight + (edge.weight ?? 0));
      existing.count = (existing.count ?? 1) + 1;
    } else {
      merged.set(key, {
        source,
        target,
        type: edge.type,
        ...(edge.description ? { description: edge.description } : {}),
        weight: edge.weight ?? 0.5,
        count: 1,
      });
    }
  }

  return [...merged.values()];
}

/**
 * Attaches each symbol to the unit that defines it — via a `contains` edge when
 * the analyzer emitted one, otherwise by file path.
 */
function mapSymbolsToUnits(
  symbols: GraphNode[],
  units: GraphNode[],
  edges: GraphEdge[],
): Map<string, string> {
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const unitsByPath = new Map<string, GraphNode>();
  for (const unit of units) {
    if (!unit.filePath) continue;
    const path = normalizePath(unit.filePath);
    const existing = unitsByPath.get(path);
    // Prefer a `class` over the enclosing `file` so methods nest under a class.
    if (!existing || (existing.type === "file" && unit.type === "class")) {
      unitsByPath.set(path, unit);
    }
  }

  const owner = new Map<string, string>();
  for (const edge of edges) {
    if (edge.type !== "contains") continue;
    if (!unitById.has(edge.source)) continue;
    owner.set(edge.target, edge.source);
  }

  const result = new Map<string, string>();
  for (const symbol of symbols) {
    const viaEdge = owner.get(symbol.id);
    if (viaEdge) {
      result.set(symbol.id, viaEdge);
      continue;
    }
    if (symbol.filePath) {
      const unit = unitsByPath.get(normalizePath(symbol.filePath));
      if (unit) result.set(symbol.id, unit.id);
    }
  }
  return result;
}

/*
 * The tree is assembled by mutating a single `TreeContext` accumulator that is
 * threaded through the recursion. Rebuilding and returning fresh maps at every
 * level would copy the whole node index once per folder — quadratic on a repo
 * with thousands of files — so the mutation is deliberate, and the context is
 * created and owned entirely by `buildHierarchy`.
 */
/* eslint-disable no-param-reassign */
interface TreeContext {
  nodesById: Record<string, CodeGraphNode>;
  childrenByParent: Record<string, string[]>;
  parentById: Record<string, string | null>;
  /** node id -> its ancestor chain, root-first, used to lift edges. */
  ancestry: Map<string, string[]>;
  symbolsByUnit: Map<string, GraphNode[]>;
  layerOf: Map<string, { id: string; name: string }>;
  allEdges: GraphEdge[];
}

function attachUnit(
  ctx: TreeContext,
  unit: GraphNode,
  parentId: string,
  chain: string[],
): CodeGraphNode {
  const owned = ctx.symbolsByUnit.get(unit.id) ?? [];
  const unitNode = toCodeGraphNode(
    unit,
    "unit",
    owned.length,
    ctx.layerOf.get(unit.id),
  );

  ctx.nodesById[unit.id] = unitNode;
  ctx.parentById[unit.id] = parentId;
  (ctx.childrenByParent[parentId] ??= []).push(unit.id);
  ctx.ancestry.set(unit.id, [...chain, unit.id]);

  ctx.childrenByParent[unit.id] ??= [];
  for (const symbol of owned) {
    const symbolNode = toCodeGraphNode(
      symbol,
      "symbol",
      0,
      ctx.layerOf.get(symbol.id),
    );
    ctx.nodesById[symbol.id] = symbolNode;
    ctx.parentById[symbol.id] = unit.id;
    ctx.childrenByParent[unit.id].push(symbol.id);
    ctx.ancestry.set(symbol.id, [...chain, unit.id, symbol.id]);
  }

  return unitNode;
}

/**
 * Splits `units` into modules beneath `parentId`, recursing on any folder that
 * is still too large to render. This is what guarantees the level cap: a
 * folder of 900 files becomes nested module levels, never one flat canvas.
 *
 * Returns the direct children created, so the caller can summarise them.
 */
function buildModuleTree(
  ctx: TreeContext,
  units: GraphNode[],
  parentId: string,
  chain: string[],
  depth: number,
): CodeGraphNode[] {
  ctx.childrenByParent[parentId] ??= [];

  const withPath = units.filter((unit) => unit.filePath);
  const withoutPath = units.filter((unit) => !unit.filePath);

  const created: CodeGraphNode[] = [];

  // Nodes with no file path can't be split on folders. Upstream's
  // connectivity-based clustering is the right tool for exactly this case.
  if (withoutPath.length > 0) {
    if (withoutPath.length <= MAX_LEVEL_CHILDREN || depth > 6) {
      for (const unit of withoutPath) {
        created.push(attachUnit(ctx, unit, parentId, chain));
      }
    } else {
      const { containers, ungrouped } = deriveContainers(
        withoutPath,
        ctx.allEdges,
      );
      const byId = new Map(withoutPath.map((unit) => [unit.id, unit]));
      for (const container of containers) {
        const moduleId = `${parentId}/module:${slug(container.name)}`;
        const members = container.nodeIds
          .map((id) => byId.get(id))
          .filter((unit): unit is GraphNode => Boolean(unit));
        const children = buildModuleTree(
          ctx,
          members,
          moduleId,
          [...chain, moduleId],
          depth + 1,
        );
        created.push(
          registerAggregate(
            ctx,
            moduleId,
            container.name,
            "module",
            parentId,
            children,
          ),
        );
      }
      for (const id of ungrouped) {
        const unit = byId.get(id);
        if (unit) created.push(attachUnit(ctx, unit, parentId, chain));
      }
    }
  }

  if (withPath.length === 0) return created;

  if (withPath.length <= MAX_LEVEL_CHILDREN || depth > 8) {
    for (const unit of withPath) {
      created.push(attachUnit(ctx, unit, parentId, chain));
    }
    return created;
  }

  // Split on the first path segment that actually distinguishes these units.
  const prefix = commonDirPrefix(
    withPath.map((unit) => normalizePath(unit.filePath!)),
  );
  const groups = new Map<string, GraphNode[]>();
  const direct: GraphNode[] = [];

  for (const unit of withPath) {
    const rest = normalizePath(unit.filePath!).slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash < 0) {
      // A file sitting directly in this folder — it is a child, not a group.
      direct.push(unit);
      continue;
    }
    const segment = rest.slice(0, slash);
    const bucket = groups.get(segment) ?? [];
    bucket.push(unit);
    groups.set(segment, bucket);
  }

  for (const [segment, members] of [...groups].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    // A one-file folder does not deserve a box of its own.
    if (members.length === 1) {
      created.push(attachUnit(ctx, members[0], parentId, chain));
      continue;
    }
    const moduleId = `${parentId}/module:${slug(`${prefix}${segment}`)}`;
    const children = buildModuleTree(
      ctx,
      members,
      moduleId,
      [...chain, moduleId],
      depth + 1,
    );
    created.push(
      registerAggregate(ctx, moduleId, segment, "module", parentId, children),
    );
  }

  // Files sitting directly in this folder have no deeper segment to split on.
  // A folder holding hundreds of them (a big flat `tests/` directory, say)
  // would still blow the level budget, so fall back to alphabetical buckets —
  // ugly, but a navigable A–F / G–M is far better than 500 nodes at once.
  if (direct.length > MAX_LEVEL_CHILDREN) {
    created.push(...bucketAlphabetically(ctx, direct, parentId, chain, depth));
  } else {
    for (const unit of direct) {
      created.push(attachUnit(ctx, unit, parentId, chain));
    }
  }

  return created;
}

function bucketAlphabetically(
  ctx: TreeContext,
  units: GraphNode[],
  parentId: string,
  chain: string[],
  depth: number,
): CodeGraphNode[] {
  const sorted = [...units].sort((a, b) => a.name.localeCompare(b.name));
  const bucketCount = Math.min(
    MAX_LEVEL_CHILDREN,
    Math.ceil(sorted.length / MAX_LEVEL_CHILDREN),
  );
  const perBucket = Math.ceil(sorted.length / bucketCount);

  const created: CodeGraphNode[] = [];
  for (let i = 0; i < sorted.length; i += perBucket) {
    const members = sorted.slice(i, i + perBucket);
    const label = `${members[0].name.charAt(0).toUpperCase()}–${members[members.length - 1].name.charAt(0).toUpperCase()}`;
    const moduleId = `${parentId}/range:${slug(label)}-${i}`;
    const children = buildModuleTree(
      ctx,
      members,
      moduleId,
      [...chain, moduleId],
      depth + 1,
    );
    created.push(
      registerAggregate(ctx, moduleId, label, "module", parentId, children),
    );
  }
  return created;
}

function registerAggregate(
  ctx: TreeContext,
  id: string,
  name: string,
  level: CodeGraphLevelKind,
  parentId: string | null,
  children: CodeGraphNode[],
): CodeGraphNode {
  const descendantFiles = new Set<string>();
  for (const child of children) {
    for (const path of child.filePaths) descendantFiles.add(path);
  }

  const node: CodeGraphNode = {
    id,
    level,
    type: level === "subsystem" ? "service" : "module",
    name,
    summary:
      level === "subsystem"
        ? `${descendantFiles.size} files across ${children.length} modules`
        : `${children.length} items`,
    complexity: "moderate",
    tags: [],
    childCount: children.length,
    filePaths: aggregateFilePaths(children),
    ...(children[0]?.layerId
      ? { layerId: children[0].layerId, layerName: children[0].layerName }
      : {}),
  };

  ctx.nodesById[id] = node;
  ctx.parentById[id] = parentId;
  ctx.childrenByParent[id] ??= [];
  if (parentId !== null) {
    (ctx.childrenByParent[parentId] ??= []).push(id);
  }
  return node;
}

/* eslint-enable no-param-reassign */

export function buildHierarchy(
  graph: KnowledgeGraph,
  hints: SubsystemHint[] = [],
): HierarchyResult {
  const allNodes = graph.nodes ?? [];
  const allEdges = graph.edges ?? [];

  const symbols = allNodes.filter(isSymbol);
  const units = allNodes.filter((node) => !isSymbol(node));

  const symbolOwner = mapSymbolsToUnits(symbols, units, allEdges);
  // A symbol we cannot place would silently vanish; keep it as a unit so it
  // stays reachable rather than dropping data on the floor.
  const orphanSymbols = symbols.filter((symbol) => !symbolOwner.has(symbol.id));
  const placedUnits = [...units, ...orphanSymbols];

  const symbolsByUnit = new Map<string, GraphNode[]>();
  for (const symbol of symbols) {
    const unitId = symbolOwner.get(symbol.id);
    if (!unitId) continue;
    const bucket = symbolsByUnit.get(unitId) ?? [];
    bucket.push(symbol);
    symbolsByUnit.set(unitId, bucket);
  }

  const layerOf = new Map<string, { id: string; name: string }>();
  (graph.layers ?? []).forEach((layer) => {
    layer.nodeIds.forEach((id) =>
      layerOf.set(id, { id: layer.id, name: layer.name }),
    );
  });

  // --- Level 1: subsystems -------------------------------------------------
  // Real detected architectural layers are the PRIMARY grouping signal —
  // which files belong together is always decided by actual code structure,
  // never by which DeepWiki section happens to cite a file (Knowledge is
  // supporting metadata for this graph, not its source). Layerless units
  // fall back to folder segments. DeepWiki hints are applied afterward,
  // below, purely to relabel an already-formed bucket with a friendlier
  // name when it substantially overlaps a wiki section's real files.
  const buckets = new Map<string, { name: string; nodes: GraphNode[] }>();
  const push = (key: string, name: string, node: GraphNode) => {
    const bucket = buckets.get(key) ?? { name, nodes: [] };
    bucket.nodes.push(node);
    buckets.set(key, bucket);
  };

  const layerless: GraphNode[] = [];
  for (const unit of placedUnits) {
    const layer = layerOf.get(unit.id);
    if (layer) push(`subsystem:layer-${slug(layer.id)}`, layer.name, unit);
    else layerless.push(unit);
  }

  // Layerless units without a real repo-relative file to split on can't be
  // folder-grouped at all.
  const layerlessWithPath = layerless.filter((unit) => unit.filePath);
  const layerlessWithoutPath = layerless.filter((unit) => !unit.filePath);
  for (const unit of layerlessWithoutPath)
    push("subsystem:other", "Other", unit);

  // Reuse the same vendored folder/community clustering `buildModuleTree`
  // already uses one level down (`deriveContainers`), instead of a naive
  // first-path-segment split — for a typical `src/`-rooted repo, taking
  // only the first segment would collapse every subsystem into one "src"
  // bucket now that this fallback runs far more often (real layer/folder
  // grouping is primary, not just what DeepWiki hints missed). Below
  // `deriveContainers`'s own internal community-detection threshold it
  // produces synthetic "Cluster A"-style names instead — worse than the
  // plain folder name for a small handful of outlier files, so those stay
  // on the simple first-segment path.
  const DERIVE_CONTAINERS_MIN_NODES = 4;
  if (layerlessWithPath.length >= DERIVE_CONTAINERS_MIN_NODES) {
    const { containers, ungrouped } = deriveContainers(
      layerlessWithPath,
      allEdges,
    );
    const byId = new Map(layerlessWithPath.map((unit) => [unit.id, unit]));
    for (const container of containers) {
      for (const nodeId of container.nodeIds) {
        const unit = byId.get(nodeId);
        if (!unit) continue;
        push(`subsystem:folder-${slug(container.id)}`, container.name, unit);
      }
    }
    // A node too small/disconnected to earn its own container — still real,
    // still must stay reachable, so it joins the shared catch-all rather
    // than silently vanishing.
    for (const nodeId of ungrouped) {
      const unit = byId.get(nodeId);
      if (unit) push("subsystem:other", "Other", unit);
    }
  } else {
    for (const unit of layerlessWithPath) {
      const path = normalizePath(unit.filePath!);
      const segment = path.includes("/")
        ? path.slice(0, path.indexOf("/"))
        : "";
      if (segment) push(`subsystem:folder-${slug(segment)}`, segment, unit);
      else push("subsystem:other", "Other", unit);
    }
  }

  relabelBucketsWithHints(buckets, hints);

  // --- Assemble the tree ---------------------------------------------------
  const ctx: TreeContext = {
    nodesById: {},
    childrenByParent: { [ROOT]: [] },
    parentById: {},
    ancestry: new Map(),
    symbolsByUnit,
    layerOf,
    allEdges,
  };

  for (const [subsystemId, bucket] of buckets) {
    const children = buildModuleTree(
      ctx,
      bucket.nodes,
      subsystemId,
      [subsystemId],
      0,
    );
    registerAggregate(
      ctx,
      subsystemId,
      bucket.name,
      "subsystem",
      null,
      children,
    );
    ctx.childrenByParent[ROOT].push(subsystemId);
  }

  // --- Pre-compute one level per parent ------------------------------------
  const levels: CodeGraphLevel[] = [];
  for (const [parentId, childIds] of Object.entries(ctx.childrenByParent)) {
    if (childIds.length === 0) continue;
    const visible = new Set(childIds);

    const edges = liftEdges(allEdges, (nodeId) => {
      const chain = ctx.ancestry.get(nodeId);
      if (!chain) return undefined;
      // Walk from the leaf up to the first ancestor rendered on this level.
      for (let i = chain.length - 1; i >= 0; i -= 1) {
        if (visible.has(chain[i])) return chain[i];
      }
      return undefined;
    });

    levels.push({
      parentId: parentId === ROOT ? null : parentId,
      nodes: childIds.map((id) => ctx.nodesById[id]).filter(Boolean),
      edges,
    });
  }

  return {
    nodesById: ctx.nodesById,
    childrenByParent: ctx.childrenByParent,
    parentById: ctx.parentById,
    levels,
    fileCount: new Set(
      allNodes
        .map((node) => node.filePath)
        .filter((p): p is string => Boolean(p)),
    ).size,
    symbolCount: symbols.length,
  };
}

/** Walks up `parentById` to produce `System > Payment Service > ... > node`. */
export function breadcrumbsFor(
  nodeId: string | null,
  nodesById: Record<string, CodeGraphNode>,
  parentById: Record<string, string | null>,
): CodeGraphCrumb[] {
  const trail: CodeGraphCrumb[] = [];
  let cursor = nodeId;
  const guard = new Set<string>();
  while (cursor) {
    if (guard.has(cursor)) break;
    guard.add(cursor);
    const node = nodesById[cursor];
    if (!node) break;
    trail.unshift({ id: cursor, name: node.name });
    cursor = parentById[cursor] ?? null;
  }
  return [{ id: null, name: "System" }, ...trail];
}
