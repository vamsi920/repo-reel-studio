/**
 * NeoDevEx-normalized CodeGraph types.
 *
 * Everything downstream of the analyzer — store, components, routes — consumes
 * only these types, never the vendored Understand-Anything `KnowledgeGraph`
 * shape. This mirrors the rule `docs/deepwiki-video-kt-integration.md` §4
 * already set for DeepWiki: the vendor's schema is an implementation detail of
 * one adapter, so a vendor bump can never ripple through the UI.
 */

/** Where a node sits in the four-level drill-down. */
export type CodeGraphLevelKind =
  /** L1: a major subsystem / domain / service of the system. */
  | "subsystem"
  /** L2: a module or component within a subsystem. */
  | "module"
  /** L3: a file or class within a module. */
  | "unit"
  /** L4: a method, function or other leaf symbol. */
  | "symbol";

export const LEVEL_ORDER: CodeGraphLevelKind[] = [
  "subsystem",
  "module",
  "unit",
  "symbol",
];

/**
 * The structural kind reported by the analyzer, kept as a free-form string
 * because it passes through the vendored node components' colour maps
 * (`file`, `function`, `class`, `module`, `service`, `endpoint`, ...).
 */
export type CodeGraphNodeType = string;

export type CodeGraphComplexity = "simple" | "moderate" | "complex";

export interface CodeGraphNode {
  id: string;
  /** Which drill-down level this node belongs to. */
  level: CodeGraphLevelKind;
  /** Structural type, drives node colour. */
  type: CodeGraphNodeType;
  name: string;
  summary: string;
  complexity: CodeGraphComplexity;
  tags: string[];
  filePath?: string;
  lineRange?: [number, number];
  /**
   * How many children this node has at the next level down. `0` means the node
   * is a leaf and clicking it must not attempt a drill-down fetch.
   */
  childCount: number;
  /** Distinct file paths reachable beneath this node, capped for aggregates. */
  filePaths: string[];
  /** Architectural layer this node was assigned to, for colour grouping. */
  layerId?: string;
  layerName?: string;
}

export interface CodeGraphEdge {
  source: string;
  target: string;
  type: string;
  description?: string;
  /** 0-1. Aggregated edges carry the summed weight of what they stand in for. */
  weight: number;
  /** How many underlying relationships an aggregated edge represents. */
  count?: number;
}

/**
 * One rendered level: the children of `parentId` plus the edges between them.
 * `parentId === null` is the system view (L1).
 */
export interface CodeGraphLevel {
  parentId: string | null;
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
}

/** Detail shown in the side panel when a node is selected. */
export interface CodeGraphNodeDetail {
  node: CodeGraphNode;
  /** Edges out of this node — what it depends on. */
  dependencies: { node: CodeGraphNode; edge: CodeGraphEdge }[];
  /** Edges into this node — what uses it. */
  usedBy: { node: CodeGraphNode; edge: CodeGraphEdge }[];
  /** Siblings sharing a parent, i.e. related components. */
  related: CodeGraphNode[];
  /** Named symbols defined beneath this node. */
  symbols: { name: string; type: string; filePath?: string }[];
}

export interface CodeGraphMeta {
  workspaceId: string;
  repositoryId: string;
  /** The commit the graph was built from. Never presented as "current" without a freshness check. */
  commitSha: string;
  generatedAt: string;
  fileCount: number;
  symbolCount: number;
  languages: string[];
  frameworks: string[];
  /**
   * Set when the graph came from the browser fallback rather than a full
   * sandbox analysis. The UI must say so rather than pass a partial graph off
   * as complete.
   */
  reducedAnalysis?: boolean;
  /** Files the reduced pass skipped, when `reducedAnalysis` is set. */
  skippedFileCount?: number;
}

/** Stable key for one graph: a workspace's repository at one exact commit. */
export function codeGraphKey(
  workspaceId: string,
  repositoryId: string,
  commitSha: string,
): string {
  return `${workspaceId}::${repositoryId}::${commitSha}`;
}

/** One breadcrumb hop, from the system root down to the current node. */
export interface CodeGraphCrumb {
  /** `null` for the system root. */
  id: string | null;
  name: string;
}
