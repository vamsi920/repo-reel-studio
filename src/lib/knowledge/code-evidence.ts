import type { AnalysisHandle } from "#/lib/codegraph/analyzer-runner";

const MAX_SUBSYSTEMS = 20;
const MAX_EXAMPLE_FILES = 4;

export interface CodeEvidenceSubsystem {
  name: string;
  layerName?: string;
  fileCount: number;
  exampleFiles: string[];
}

export interface CodeEvidenceSummary {
  fileCount: number;
  symbolCount: number;
  languages: string[];
  frameworks: string[];
  subsystems: CodeEvidenceSubsystem[];
  subsystemEdges: { from: string; to: string; count: number }[];
  /** Ready to inline verbatim into the structure-determination prompt. */
  rendered: string;
}

/**
 * Condenses one `AnalysisHandle` (the real, tree-sitter-derived CodeGraph
 * analysis for a commit) into a compact text block for the DeepWiki
 * structure-determination prompt. Scoped to the L1/root level only — this
 * reasons at subsystem granularity, so drilling into every subsystem's
 * children would multiply sandbox round-trips for value the prompt mostly
 * doesn't need.
 */
export function buildEvidenceSummary(
  handle: AnalysisHandle,
): CodeEvidenceSummary {
  const { meta, root } = handle;
  // `CodeGraphNode` only carries `layerId`, not a separate display name, and
  // `CodeGraphLevelPayload` doesn't expose a layers list to resolve it
  // against — the id itself is the best available label for this summary.
  const subsystems: CodeEvidenceSubsystem[] = root.nodes
    .slice()
    .sort((a, b) => b.filePaths.length - a.filePaths.length)
    .slice(0, MAX_SUBSYSTEMS)
    .map((node) => ({
      name: node.name,
      layerName: node.layerId,
      fileCount: node.filePaths.length,
      exampleFiles: node.filePaths.slice(0, MAX_EXAMPLE_FILES),
    }));

  const nameById = new Map(root.nodes.map((n) => [n.id, n.name]));
  const subsystemEdges = root.edges
    .filter((e) => nameById.has(e.source) && nameById.has(e.target))
    .map((e) => ({
      from: nameById.get(e.source) ?? e.source,
      to: nameById.get(e.target) ?? e.target,
      count: e.count ?? 1,
    }));

  const lines: string[] = [
    `Repository: ${meta.fileCount} files, ${meta.symbolCount} symbols.`,
    `Languages: ${meta.languages.join(", ") || "unknown"}.`,
    meta.frameworks.length
      ? `Frameworks/libraries detected: ${meta.frameworks.join(", ")}.`
      : "",
    "",
    "Detected subsystems (from real parsed-code structure, not file paths):",
    ...subsystems.map((s) => {
      const layer = s.layerName ? ` [layer: ${s.layerName}]` : "";
      const examples = s.exampleFiles.length
        ? ` — e.g. ${s.exampleFiles.join(", ")}`
        : "";
      return `- ${s.name}${layer} (${s.fileCount} files)${examples}`;
    }),
  ];

  if (subsystemEdges.length) {
    lines.push(
      "",
      "Real dependencies between subsystems (from actual imports/calls):",
      ...subsystemEdges
        .slice(0, 40)
        .map((e) => `- ${e.from} → ${e.to} (${e.count} references)`),
    );
  }

  return {
    fileCount: meta.fileCount,
    symbolCount: meta.symbolCount,
    languages: meta.languages,
    frameworks: meta.frameworks,
    subsystems,
    subsystemEdges,
    rendered: lines.filter(Boolean).join("\n"),
  };
}

export interface EvidenceSubsystemEntry {
  name: string;
  layerId?: string;
  filePaths: string[];
}

/**
 * A distinct, additive representation from `buildEvidenceSummary` — full
 * per-subsystem file lists (not the 4-example cap used for the structure
 * prompt), so the backend can match a PAGE's own declared files against real
 * subsystems and inject only the relevant slice into that page's prompt.
 * Not used for structure determination; `buildEvidenceSummary` still owns
 * that (its truncated shape is correct there).
 */
export function buildEvidenceSubsystemIndex(
  handle: AnalysisHandle,
): EvidenceSubsystemEntry[] {
  return handle.root.nodes.map((node) => ({
    name: node.name,
    layerId: node.layerId,
    filePaths: node.filePaths,
  }));
}
