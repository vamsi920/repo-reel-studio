import { getImportantFiles } from "@/lib/codeGraph";
import type {
  GitNexusCluster,
  GitNexusGraphData,
  GitNexusNode,
  RepoClusterSummary,
  RepoEvidenceBundle,
  RepoFact,
  RepoProcessFlow,
  RepoSnippet,
  SourceRef,
} from "@/lib/types";

const ENTRY_PATTERNS = [
  /(^|\/)(app|main|index|server|start)\.(t|j)sx?$/i,
  /(^|\/)main\.py$/i,
  /(^|\/)main\.go$/i,
  /(^|\/)lib\.rs$/i,
  /(^|\/)Program\.cs$/i,
];

const TEST_FILE_RE = /(^|\/)(__tests__|tests?|spec|e2e)\//i;
const TEST_NAME_RE = /(?:^|\/)(?:test_.*|.*(?:_test|_spec)|.*\.(?:test|spec|e2e))\.[^.\/]+$/i;
const DOC_RE = /(^|\/)(readme|docs?|guide|overview|architecture|contributing|changelog)/i;
const CONFIG_RE = /(^|\/)(\.env|.*config|settings|vite\.config|tailwind\.config|dockerfile|docker-compose|package\.json|tsconfig|eslint|prettier|supabase|auth|ci|workflows?|netlify|vercel|render|\.github)(\/|\.|$)/i;
const SOURCE_HINT_RE = /(^|\/)(src|lib|app|server|core|pkg|internal|connection|protocol|service|services|components|pages|api)\//i;
const CODE_FILE_RE = /\.(ts|tsx|js|jsx|py|go|rs|java|kt|c|cc|cpp|hpp|h|cs|php|rb|swift|dart)$/i;

const normalizePath = (value: string) => value.replace(/^\.\/+/, "").replace(/^\/+/, "");

const uniqueStrings = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.trim())
    )
  );

export const humanizeFileLabel = (value: string) =>
  value
    .split("/")
    .pop()
    ?.replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || value;

export const isDocFile = (filePath: string) =>
  DOC_RE.test(filePath) || /\.(md|mdx|txt|rst)$/i.test(filePath);

export const isConfigFile = (filePath: string) => CONFIG_RE.test(filePath);

export const isTestFile = (filePath: string) =>
  TEST_FILE_RE.test(filePath) || TEST_NAME_RE.test(filePath);

export const isSourceCodeFile = (filePath: string) =>
  CODE_FILE_RE.test(filePath) &&
  !isDocFile(filePath) &&
  !isConfigFile(filePath) &&
  !isTestFile(filePath);

const countWords = (text: string) =>
  text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const countLines = (text: string) => text.split(/\r?\n/).length;

const escapeMermaidLabel = (value: string) =>
  value.replace(/"/g, "'").replace(/\n/g, "\\n");

const buildNodeLookup = (graph: GitNexusGraphData | null | undefined) =>
  new Map((graph?.nodes ?? []).map((node) => [node.id, node] as const));

const resolvePathAgainstFiles = (
  candidate: string | undefined,
  availableFiles: string[]
): string | null => {
  if (!candidate) return null;
  if (availableFiles.includes(candidate)) return candidate;

  const normalized = normalizePath(candidate);
  const normalizedMap = new Map(
    availableFiles.map((file) => [normalizePath(file), file] as const)
  );
  if (normalizedMap.has(normalized)) {
    return normalizedMap.get(normalized) ?? null;
  }

  const suffixMatches = availableFiles.filter((file) =>
    normalizePath(file).endsWith(`/${normalized}`)
  );
  if (suffixMatches.length === 1) return suffixMatches[0];

  const basename = normalized.split("/").pop();
  if (!basename) return null;

  const basenameMatches = availableFiles.filter(
    (file) => normalizePath(file).split("/").pop() === basename
  );
  if (basenameMatches.length === 1) return basenameMatches[0];

  return null;
};

const getFileSymbols = (
  graph: GitNexusGraphData | null | undefined,
  filePath: string
) =>
  (graph?.nodes ?? [])
    .filter((node) => node.kind !== "File" && node.filePath === filePath)
    .sort((a, b) => {
      const complexityDiff = (b.complexity ?? 0) - (a.complexity ?? 0);
      if (complexityDiff !== 0) return complexityDiff;
      const aDoc = a.docstring ? 1 : 0;
      const bDoc = b.docstring ? 1 : 0;
      if (aDoc !== bDoc) return bDoc - aDoc;
      return (a.startLine ?? 0) - (b.startLine ?? 0);
    });

const getRepresentativeSymbol = (
  graph: GitNexusGraphData | null | undefined,
  filePath: string
) => getFileSymbols(graph, filePath)[0] ?? null;

const buildSourceRef = (
  filePath: string,
  fileContents: Record<string, string>,
  graph?: GitNexusGraphData | null,
  reason?: string
): SourceRef => {
  const content = fileContents[filePath] || "";
  const totalLines = Math.max(1, countLines(content || "\n"));
  const symbol = getRepresentativeSymbol(graph, filePath);

  if (symbol?.startLine) {
    const estimatedSpan = Math.max(
      8,
      symbol.codeSnippet?.split(/\r?\n/).length ?? Math.min(18, totalLines)
    );
    const start = Math.max(1, symbol.startLine - 2);
    const end = Math.min(totalLines, symbol.startLine + estimatedSpan + 2);
    return {
      file_path: filePath,
      start_line: start,
      end_line: Math.max(start, end),
      symbol_name: symbol.name,
      reason,
    };
  }

  return {
    file_path: filePath,
    start_line: 1,
    end_line: Math.min(totalLines, 24),
    reason,
  };
};

export const getCodeExcerptForRef = (
  fileContents: Record<string, string>,
  ref: SourceRef
) => {
  const content = fileContents[ref.file_path];
  if (!content) return "";
  const lines = content.split(/\r?\n/);
  return lines
    .slice(ref.start_line - 1, ref.end_line)
    .join("\n");
};

const buildSnippetFromRef = (
  ref: SourceRef,
  fileContents: Record<string, string>,
  score: number,
  role: string
): RepoSnippet => ({
  id: `${ref.file_path}:${ref.start_line}-${ref.end_line}`,
  file_path: ref.file_path,
  start_line: ref.start_line,
  end_line: ref.end_line,
  code: getCodeExcerptForRef(fileContents, ref),
  score,
  role,
  symbol_name: ref.symbol_name,
});

const clusterFiles = (
  cluster: GitNexusCluster,
  graph: GitNexusGraphData,
  availableFiles: string[]
) => {
  const nodeLookup = buildNodeLookup(graph);
  return uniqueStrings(
    cluster.members.map((memberId) => {
      const node = nodeLookup.get(memberId);
      return resolvePathAgainstFiles(node?.filePath ?? memberId, availableFiles);
    })
  );
};

const buildProcessMermaid = (process: RepoProcessFlow) => {
  if (!process.steps.length) return "";
  const lines = ["flowchart LR"];
  process.steps.slice(0, 6).forEach((step, index) => {
    const label = `${step.symbol_name}\\n${step.file_path.split("/").pop() || step.file_path}`;
    lines.push(`P${index}["${escapeMermaidLabel(label)}"]`);
    if (index > 0) {
      lines.push(`P${index - 1} --> P${index}`);
    }
  });
  return lines.join("\n");
};

const buildClusterMermaid = (cluster: RepoClusterSummary) => {
  if (!cluster.file_paths.length) return "";
  const lines = ["flowchart TD"];
  lines.push(`ROOT["${escapeMermaidLabel(cluster.label)}"]`);
  cluster.file_paths.slice(0, 5).forEach((filePath, index) => {
    lines.push(
      `F${index}["${escapeMermaidLabel(filePath.split("/").pop() || filePath)}"]`
    );
    lines.push(`ROOT --> F${index}`);
  });
  return lines.join("\n");
};

const buildLanguageCounts = (filePaths: string[]) => {
  const counts: Record<string, number> = {};
  filePaths.forEach((filePath) => {
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (!ext) return;
    counts[ext] = (counts[ext] ?? 0) + 1;
  });
  return counts;
};

const buildRepoFacts = (
  repoName: string,
  availableFiles: string[],
  sourceFiles: string[],
  entryCandidates: string[],
  hubFiles: string[],
  openerCandidates: Array<{ file_path: string; score: number; reasons: string[] }>,
  graph: GitNexusGraphData | null | undefined,
  fileContents: Record<string, string>
): RepoFact[] => {
  const facts: RepoFact[] = [];

  const architecture = graph?.summary?.architecturePattern;
  if (architecture) {
    const target = openerCandidates[0]?.file_path || entryCandidates[0] || availableFiles[0];
    if (target) {
      facts.push({
        label: "Architecture",
        value: architecture,
        source_refs: [buildSourceRef(target, fileContents, graph, "Architecture anchor")],
      });
    }
  }

  if (entryCandidates.length > 0) {
    facts.push({
      label: "Entry Points",
      value: entryCandidates.slice(0, 3).map(humanizeFileLabel).join(", "),
      source_refs: entryCandidates
        .slice(0, 3)
        .map((filePath) => buildSourceRef(filePath, fileContents, graph, "Entry point")),
    });
  }

  if (hubFiles.length > 0) {
    facts.push({
      label: "Hub Modules",
      value: hubFiles.slice(0, 3).map(humanizeFileLabel).join(", "),
      source_refs: hubFiles
        .slice(0, 3)
        .map((filePath) => buildSourceRef(filePath, fileContents, graph, "Hub file")),
    });
  }

  const keyTechnologies = graph?.summary?.keyTechnologies?.slice(0, 5) ?? [];
  if (keyTechnologies.length > 0) {
    const target = openerCandidates[0]?.file_path || sourceFiles[0] || availableFiles[0];
    if (target) {
      facts.push({
        label: "Primary Stack",
        value: keyTechnologies.join(", "),
        source_refs: [buildSourceRef(target, fileContents, graph, "Technology anchor")],
      });
    }
  }

  facts.push({
    label: "Code Surface",
    value: `${sourceFiles.length} source files across ${availableFiles.length} total files`,
    source_refs: [
      buildSourceRef(
        openerCandidates[0]?.file_path || sourceFiles[0] || availableFiles[0],
        fileContents,
        graph,
        "Repo size anchor"
      ),
    ].filter(Boolean),
  });

  return facts;
};

const buildOpenerReasons = (
  filePath: string,
  graph: GitNexusGraphData | null | undefined,
  symbol: GitNexusNode | null
) => {
  const reasons: string[] = [];
  if (SOURCE_HINT_RE.test(filePath)) reasons.push("lives in a primary source directory");
  if (ENTRY_PATTERNS.some((pattern) => pattern.test(filePath))) reasons.push("looks like an entry point");
  if (graph?.summary?.entryPoints?.includes(filePath)) reasons.push("is marked as a graph entry point");
  if (graph?.summary?.hubFiles?.includes(filePath)) reasons.push("is a hub file with many incoming dependencies");
  if (symbol?.docstring) reasons.push("has documented behavior");
  if (/service|client|driver|connection|provider|engine|manager|controller/i.test(filePath)) {
    reasons.push("its name suggests a core business or integration role");
  }
  return reasons;
};

export const buildRepoEvidenceBundle = (
  repoName: string,
  fileContents: Record<string, string>,
  graph?: GitNexusGraphData | null
): RepoEvidenceBundle => {
  const repoTree = Object.keys(fileContents).sort();
  const sourceFiles = repoTree.filter(isSourceCodeFile);
  const effectiveSourceFiles = sourceFiles.length > 0 ? sourceFiles : repoTree.filter((file) => !isDocFile(file));
  const importantFiles = uniqueStrings(
    (graph ? getImportantFiles(graph).files : [])
      .map((file) => resolvePathAgainstFiles(file, repoTree))
  ).filter(Boolean) as string[];

  const entryCandidates = uniqueStrings([
    ...(graph?.summary?.entryPoints ?? []).map((file) => resolvePathAgainstFiles(file, repoTree)),
    ...repoTree.filter((file) => ENTRY_PATTERNS.some((pattern) => pattern.test(file))),
    importantFiles[0],
  ]).filter((file) => repoTree.includes(file));

  const hubFiles = uniqueStrings([
    ...(graph?.summary?.hubFiles ?? []).map((file) => resolvePathAgainstFiles(file, repoTree)),
    ...importantFiles,
  ])
    .filter((file) => repoTree.includes(file))
    .slice(0, 8);

  const openerCandidates = effectiveSourceFiles
    .map((filePath) => {
      const symbol = getRepresentativeSymbol(graph, filePath);
      const reasons = buildOpenerReasons(filePath, graph, symbol);
      let score = 0;

      if (isSourceCodeFile(filePath)) score += 12;
      if (SOURCE_HINT_RE.test(filePath)) score += 5;
      if (ENTRY_PATTERNS.some((pattern) => pattern.test(filePath))) score += 5;
      if (graph?.summary?.entryPoints?.includes(filePath)) score += 6;
      if (graph?.summary?.hubFiles?.includes(filePath)) score += 6;
      if (/service|client|driver|connection|provider|engine|manager|controller/i.test(filePath)) {
        score += 4;
      }
      score += Math.min((symbol?.complexity ?? 0) / 4, 4);
      score += Math.min(countLines(fileContents[filePath] || "") / 80, 4);
      score += Math.min(countWords(symbol?.docstring || "") / 12, 2);

      if (isDocFile(filePath) || isConfigFile(filePath) || isTestFile(filePath)) {
        score -= 20;
      }

      return {
        file_path: filePath,
        score,
        reasons: reasons.length > 0 ? reasons : ["contains executable source code"],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const clusterSummaries: RepoClusterSummary[] = (graph?.clusters ?? [])
    .map((cluster) => {
      const files = clusterFiles(cluster, graph!, repoTree).filter((file) =>
        repoTree.includes(file)
      );
      const sourceFileCount = files.filter((file) => isSourceCodeFile(file)).length;
      const testFileCount = files.filter((file) => isTestFile(file)).length;
      const configFileCount = files.filter((file) => isConfigFile(file)).length;
      const representativeFile =
        importantFiles.find((candidate) => files.includes(candidate)) ||
        files.find((file) => isSourceCodeFile(file)) ||
        files[0];
      const rankingScore =
        sourceFileCount * 4 +
        files.length * 1.5 -
        testFileCount * 2.5 -
        configFileCount * 1.5 +
        (representativeFile && isSourceCodeFile(representativeFile) ? 6 : 0);

      return {
        summary: {
          cluster_id: cluster.id,
          label: cluster.label || humanizeFileLabel(cluster.id),
          description: cluster.description,
          representative_file: representativeFile,
          file_paths: files.slice(0, 6),
          member_count: files.length || cluster.members.length,
        },
        rankingScore,
      };
    })
    .filter((cluster) => cluster.summary.file_paths.length > 0)
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, 5)
    .map(({ summary }) => ({
      ...summary,
      mermaid: buildClusterMermaid(summary),
    }));

  const processFlows: RepoProcessFlow[] = (graph?.processes ?? [])
    .map((process, index) => ({
      id:
        process.id ||
        `process-${index + 1}-${(process.name || "flow").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: process.name,
      description: process.description,
      steps: (process.steps ?? []).map((step) => ({
        symbol_name: step.symbolName,
        file_path: resolvePathAgainstFiles(step.filePath, repoTree) || step.filePath,
        step_index: step.stepIndex,
        code_snippet: step.codeSnippet,
      })),
    }))
    .filter((process) => process.steps.length >= 2)
    .sort((a, b) => b.steps.length - a.steps.length)
    .slice(0, 4)
    .map((process) => ({
      ...process,
      mermaid: buildProcessMermaid(process),
    }));

  const filesToCatalog = uniqueStrings([
    ...openerCandidates.slice(0, 6).map((candidate) => candidate.file_path),
    ...entryCandidates.slice(0, 4),
    ...hubFiles.slice(0, 6),
    ...clusterSummaries.map((cluster) => cluster.representative_file),
    ...processFlows.flatMap((process) => process.steps.slice(0, 4).map((step) => step.file_path)),
  ]).filter((filePath) => repoTree.includes(filePath));

  const snippetCatalog: RepoSnippet[] = filesToCatalog.map((filePath, index) => {
    const opener = openerCandidates.find((candidate) => candidate.file_path === filePath);
    const role = opener
      ? "opener"
      : entryCandidates.includes(filePath)
        ? "entry"
        : hubFiles.includes(filePath)
          ? "hub"
          : "support";
    const ref = buildSourceRef(filePath, fileContents, graph, `${role} evidence`);
    return buildSnippetFromRef(ref, fileContents, opener?.score ?? 40 - index, role);
  });

  const repoFacts = buildRepoFacts(
    repoName,
    repoTree,
    sourceFiles,
    entryCandidates,
    hubFiles,
    openerCandidates,
    graph,
    fileContents
  );

  const totalLines = repoTree.reduce(
    (sum, filePath) => sum + countLines(fileContents[filePath] || ""),
    0
  );

  return {
    repo_tree: repoTree,
    source_files: sourceFiles,
    entry_candidates: entryCandidates,
    hub_files: hubFiles,
    important_files: importantFiles,
    opener_candidates: openerCandidates,
    cluster_summaries: clusterSummaries,
    process_flows: processFlows,
    snippet_catalog: snippetCatalog.filter((snippet) => snippet.code.trim().length > 0),
    repo_facts: repoFacts,
    repo_stats: {
      total_files: repoTree.length,
      total_source_files: sourceFiles.length,
      total_lines: totalLines,
      languages: graph?.summary?.languages || buildLanguageCounts(repoTree),
      architecture_pattern: graph?.summary?.architecturePattern,
      key_technologies: graph?.summary?.keyTechnologies,
    },
  };
};

export const getRelatedFilesForFile = (
  graph: GitNexusGraphData | null | undefined,
  filePath: string,
  availableFiles: string[],
  limit = 6
) => {
  if (!graph?.edges?.length) return [];

  const nodeLookup = buildNodeLookup(graph);
  const scoreByFile = new Map<string, number>();
  const toFilePath = (nodeId: string) =>
    resolvePathAgainstFiles(nodeLookup.get(nodeId)?.filePath ?? nodeId, availableFiles);

  for (const edge of graph.edges) {
    const sourceFile = toFilePath(edge.source);
    const targetFile = toFilePath(edge.target);
    if (!sourceFile || !targetFile || sourceFile === targetFile) continue;

    if (sourceFile === filePath) {
      scoreByFile.set(targetFile, (scoreByFile.get(targetFile) ?? 0) + 2);
    }
    if (targetFile === filePath) {
      scoreByFile.set(sourceFile, (scoreByFile.get(sourceFile) ?? 0) + 3);
    }
  }

  return Array.from(scoreByFile.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([candidate]) => candidate)
    .filter((candidate) => candidate !== filePath)
    .slice(0, limit);
};

export const getSnippetForFile = (
  bundle: RepoEvidenceBundle,
  filePath: string
) =>
  bundle.snippet_catalog.find((snippet) => snippet.file_path === filePath);

export const buildSceneSourceRefs = (
  filePaths: string[],
  bundle: RepoEvidenceBundle,
  fileContents: Record<string, string>,
  graph?: GitNexusGraphData | null,
  reason?: string
) =>
  uniqueStrings(filePaths)
    .map((filePath) => {
      const snippet = getSnippetForFile(bundle, filePath);
      if (snippet) {
        return {
          file_path: snippet.file_path,
          start_line: snippet.start_line,
          end_line: snippet.end_line,
          symbol_name: snippet.symbol_name,
          reason,
        } as SourceRef;
      }
      return filePath && fileContents[filePath]
        ? buildSourceRef(filePath, fileContents, graph, reason)
        : null;
    })
    .filter((value): value is SourceRef => Boolean(value));
