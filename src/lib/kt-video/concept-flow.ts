import type {
  AnalysisHandle,
  CodeGraphLevelPayload,
} from "#/lib/codegraph/analyzer-runner";
import type { CodeGraphNode } from "#/lib/codegraph/codegraph-types";
import type { KtConceptHop } from "./build-manifest";

const MAX_HOPS = 4;
const MAX_DRILL_DEPTH = 3;

function overlapsFiles(node: CodeGraphNode, files: Set<string>): boolean {
  if (node.filePath && files.has(node.filePath)) return true;
  return node.filePaths.some((f) => files.has(f));
}

/**
 * Walks a cached CodeGraph analysis (already computed for this repo/commit
 * from an earlier CodeGraph visit — this never triggers a fresh analysis
 * run) to find a real, connected chain of nodes whose files overlap the
 * Knowledge page's own relevant files, drilling down from subsystem level
 * until it reaches nodes with a real single `filePath`/`lineRange` (unit or
 * symbol level) and a real edge between at least two of them. Returns []
 * when no cached handle exists, nothing overlaps, or no real connected
 * chain is found — the caller then simply skips the concept/flow scene,
 * never fabricating one.
 */
export async function findConceptFlow(
  handle: AnalysisHandle,
  relevantFilePaths: string[],
): Promise<KtConceptHop[]> {
  const files = new Set(relevantFilePaths);
  if (files.size === 0) return [];

  try {
    let level: CodeGraphLevelPayload = handle.root;
    let matched = level.nodes.filter((n) => overlapsFiles(n, files));

    for (let depth = 0; depth < MAX_DRILL_DEPTH; depth += 1) {
      // Nodes with a real single filePath+lineRange are concrete enough to
      // cite in a scene (unit/symbol level) — stop drilling once we have at
      // least two of those.
      const concrete = matched.filter((n) => n.filePath && n.lineRange);
      if (concrete.length >= 2) {
        return buildHopsFromLevel(level, concrete);
      }

      // Otherwise drill into the single best-matching aggregate node (most
      // overlap with the page's files) to get closer to real single-file
      // nodes. Bail if there's nothing to drill into.
      const candidate = matched
        .filter((n) => n.childCount > 0)
        .sort(
          (a, b) =>
            b.filePaths.filter((f) => files.has(f)).length -
            a.filePaths.filter((f) => files.has(f)).length,
        )[0];
      if (!candidate) break;

      const next = await handle.loadLevel(candidate.id);
      if (!next) break;
      level = next;
      matched = level.nodes.filter((n) => overlapsFiles(n, files));
    }

    // Last attempt at whatever depth we stopped at.
    const concrete = matched.filter((n) => n.filePath && n.lineRange);
    return concrete.length >= 2 ? buildHopsFromLevel(level, concrete) : [];
  } catch {
    return [];
  }
}

function buildHopsFromLevel(
  level: CodeGraphLevelPayload,
  concrete: CodeGraphNode[],
): KtConceptHop[] {
  const concreteIds = new Set(concrete.map((n) => n.id));
  const realEdges = level.edges.filter(
    (e) => concreteIds.has(e.source) && concreteIds.has(e.target),
  );
  if (realEdges.length === 0) return [];

  // Walk edges from whichever concrete node has the most outgoing real
  // connections, following real edges only — never inventing an order.
  const byId = new Map(concrete.map((n) => [n.id, n]));
  const outDegree = new Map<string, number>();
  for (const e of realEdges) {
    outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1);
  }
  const start = [...outDegree.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!start) return [];

  const chain: CodeGraphNode[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = start;
  while (currentId && !visited.has(currentId) && chain.length < MAX_HOPS) {
    const node = byId.get(currentId);
    if (!node) break;
    chain.push(node);
    visited.add(currentId);
    const nextEdge = realEdges.find(
      (e) => e.source === currentId && !visited.has(e.target),
    );
    currentId = nextEdge?.target;
  }

  if (chain.length < 2) return [];

  return chain.map((node) => ({
    path: node.filePath as string,
    startLine: (node.lineRange as [number, number])[0],
    endLine: (node.lineRange as [number, number])[1],
    symbol: node.level === "symbol" ? node.name : undefined,
  }));
}
