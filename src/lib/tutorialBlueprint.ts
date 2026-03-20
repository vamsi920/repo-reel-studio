import { getImportantFiles } from "@/lib/codeGraph";
import type {
  GitNexusCluster,
  GitNexusGraphData,
  GitNexusNode,
  GitNexusProcess,
  VideoManifest,
  VideoScene,
  VideoSceneDiagram,
} from "@/lib/types";

export type TutorialScenePhase =
  | "hook"
  | "architecture"
  | "flow"
  | "deep_dive"
  | "details"
  | "conclusion";

export type TutorialVisualType = "code" | "overview" | "diagram";

export interface GraphTutorialSceneBlueprint {
  id: string;
  phase: TutorialScenePhase;
  type: VideoScene["type"];
  visualType: TutorialVisualType;
  filePath: string;
  title: string;
  durationSeconds: number;
  highlightLines?: [number, number];
  bulletPoints: string[];
  focusSymbols: string[];
  diagram?: VideoSceneDiagram;
  narrationBrief: string;
}

export interface GraphTutorialBlueprint {
  title: string;
  overview: string;
  suggestedDurationSeconds: number;
  repoFiles: string[];
  importantFiles: string[];
  selectedFiles: string[];
  scenePlan: GraphTutorialSceneBlueprint[];
}

const ENTRY_PATTERNS = [
  /(^|\/)(app|main|index|server|start)\.(t|j)sx?$/i,
  /(^|\/)main\.py$/i,
  /(^|\/)main\.go$/i,
  /(^|\/)lib\.rs$/i,
];

const TEST_FILE_RE = /(^|\/)(__tests__|tests?|spec|e2e)\//i;
const TEST_NAME_RE = /(?:^|\/)(?:test_.*|.*(?:_test|_spec)|.*\.(?:test|spec|e2e))\.[^.\/]+$/i;
const CONFIG_RE = /(^|\/)(\.env|.*config|settings|vite\.config|tailwind\.config|netlify\.toml|fly\.toml|dockerfile|docker-compose|package\.json|tsconfig|supabase|auth|ci|workflows?|\.github)(\/|\.|$)/i;
const DOC_RE = /(^|\/)(readme|docs?|guide|overview|architecture)/i;
const SOURCE_HINT_RE = /(^|\/)(src|lib|app|server|core|pkg|internal|connection|protocol|service|services|components|pages)\//i;
const CODE_FILE_RE = /\.(ts|tsx|js|jsx|py|go|rs|java|kt|c|cc|cpp|hpp|h|cs|php|rb|swift|dart)$/i;

const countWords = (text: string) =>
  text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

/**
 * Calculate scene duration from narration word count.
 * Uses 2.3 words/second speaking rate + generous buffer for pauses and visual absorption.
 * Minimum 10s for code scenes, 8s for overview scenes.
 */
const dynamicSceneDuration = (
  narrationBrief: string,
  bulletPoints: string[],
  visualType: TutorialVisualType,
  phase: TutorialScenePhase
): number => {
  // Estimate narration words from brief + bullets
  const briefWords = countWords(narrationBrief);
  const bulletWords = bulletPoints.reduce((sum, b) => sum + countWords(b), 0);
  // Gemini will expand the brief to roughly 1.8x more words; bullets add context
  const estimatedNarrationWords = Math.max(briefWords * 1.8, 40) + bulletWords * 0.5;
  // Speaking rate: 2.3 words/second + 3s buffer for pauses/transitions
  const speechDuration = Math.ceil(estimatedNarrationWords / 2.3) + 3;
  // Minimums by type
  const minByType = visualType === 'diagram' ? 14 : visualType === 'overview' ? 12 : 14;
  // Phases that need more time
  const phaseBonus = phase === 'deep_dive' ? 4 : phase === 'flow' ? 3 : phase === 'architecture' ? 2 : 0;
  return Math.max(minByType, speechDuration + phaseBonus);
};

const normalizePath = (value: string) => value.replace(/^\.\/+/, "").replace(/^\/+/, "");

const uniqueStrings = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim())));

const humanizeName = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\.[^/.]+$/, "")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();

const isDocFile = (filePath: string) => DOC_RE.test(filePath) || /\.(md|mdx|txt|rst)$/i.test(filePath);

const isRealCodeFile = (filePath: string) =>
  CODE_FILE_RE.test(filePath) &&
  !TEST_FILE_RE.test(filePath) &&
  !TEST_NAME_RE.test(filePath) &&
  !CONFIG_RE.test(filePath) &&
  !isDocFile(filePath);

const buildNodeLookup = (graph: GitNexusGraphData) =>
  new Map(graph.nodes.map((node) => [node.id, node] as const));

const resolvePathAgainstFiles = (candidate: string | undefined, availableFiles: string[]): string | null => {
  if (!candidate) return null;
  if (availableFiles.includes(candidate)) return candidate;

  const normalized = normalizePath(candidate);
  const normalizedMap = new Map(availableFiles.map((file) => [normalizePath(file), file] as const));
  if (normalizedMap.has(normalized)) {
    return normalizedMap.get(normalized) ?? null;
  }

  const suffixMatches = availableFiles.filter((file) => normalizePath(file).endsWith(`/${normalized}`));
  if (suffixMatches.length === 1) {
    return suffixMatches[0];
  }

  const basename = normalized.split("/").pop();
  if (!basename) return null;

  const basenameMatches = availableFiles.filter(
    (file) => normalizePath(file).split("/").pop() === basename
  );
  if (basenameMatches.length === 1) {
    return basenameMatches[0];
  }

  return null;
};

const getFileNode = (graph: GitNexusGraphData, filePath: string) =>
  graph.nodes.find((node) => node.kind === "File" && node.filePath === filePath);

const getFileSymbols = (graph: GitNexusGraphData, filePath: string) =>
  graph.nodes
    .filter((node) => node.kind !== "File" && node.filePath === filePath)
    .sort((a, b) => {
      const complexityDiff = (b.complexity ?? 0) - (a.complexity ?? 0);
      if (complexityDiff !== 0) return complexityDiff;
      const aDoc = a.docstring ? 1 : 0;
      const bDoc = b.docstring ? 1 : 0;
      if (aDoc !== bDoc) return bDoc - aDoc;
      return (a.startLine ?? 0) - (b.startLine ?? 0);
    });

const getRepresentativeSymbol = (graph: GitNexusGraphData, filePath: string) =>
  getFileSymbols(graph, filePath)[0] ?? null;

const fileRoleLabel = (filePath: string, fileNode?: GitNexusNode | null) => {
  const tags = new Set(fileNode?.tags ?? []);
  if (tags.has("ui")) return "presentation layer";
  if (tags.has("api")) return "request handling layer";
  if (tags.has("data")) return "data model layer";
  if (tags.has("service")) return "service layer";
  if (tags.has("state")) return "state management layer";
  if (tags.has("auth")) return "security and access layer";
  if (tags.has("config")) return "configuration layer";
  if (tags.has("test")) return "verification layer";
  const parts = filePath.split("/");
  if (parts.length > 1) {
    return `${humanizeName(parts[0])} module`;
  }
  return "core module";
};

const buildHighlightLines = (
  filePath: string,
  fileContents: Record<string, string>,
  symbol?: GitNexusNode | null
): [number, number] => {
  const content = fileContents[filePath];
  const totalLines = content ? content.split(/\r?\n/).length : 1;

  if (symbol?.startLine) {
    const estimatedSpan = Math.max(
      10,
      symbol.codeSnippet?.split(/\r?\n/).length ?? 12
    );
    const start = Math.max(1, symbol.startLine - 3);
    const end = Math.min(totalLines, symbol.startLine + estimatedSpan + 3);
    return [start, Math.max(start, end)];
  }

  return [1, Math.min(24, totalLines)];
};

const fileConnectivity = (
  graph: GitNexusGraphData,
  filePath: string
) => {
  const nodeLookup = buildNodeLookup(graph);
  const toFilePath = (nodeId: string) => nodeLookup.get(nodeId)?.filePath ?? nodeId;

  let importers = 0;
  let dependencies = 0;

  for (const edge of graph.edges) {
    const sourcePath = toFilePath(edge.source);
    const targetPath = toFilePath(edge.target);
    if (edge.type === "IMPORTS" || edge.type === "CALLS") {
      if (targetPath === filePath && sourcePath !== filePath) importers += 1;
      if (sourcePath === filePath && targetPath !== filePath) dependencies += 1;
    }
  }

  return { importers, dependencies };
};

const pickFirstMatchingFile = (
  availableFiles: string[],
  patterns: RegExp[]
): string | null => {
  for (const pattern of patterns) {
    const match = availableFiles.find((file) => pattern.test(file));
    if (match) return match;
  }
  return null;
};

const pickHeroCodeFile = (
  availableFiles: string[],
  candidateFiles: string[],
  graph: GitNexusGraphData
) => {
  const graphNodeLookup = buildNodeLookup(graph);
  const scoreFile = (filePath: string) => {
    const fileNode = graphNodeLookup.get(filePath);
    let score = 0;
    if (SOURCE_HINT_RE.test(filePath)) score += 5;
    if (/\/index\./i.test(filePath) || /\/main\./i.test(filePath) || /\/app\./i.test(filePath)) score += 4;
    if (/interface|service|client|driver|connection|provider|engine|manager/i.test(filePath)) score += 3;
    score += Math.min((fileNode?.lineCount ?? 0) / 80, 4);
    score += Math.min((fileNode?.complexity ?? 0) / 5, 3);
    return score;
  };

  const filteredCandidates = uniqueStrings(candidateFiles).filter(isRealCodeFile);
  if (filteredCandidates.length > 0) {
    return filteredCandidates.sort((a, b) => scoreFile(b) - scoreFile(a))[0];
  }

  const sourceFiles = availableFiles.filter(isRealCodeFile);
  if (sourceFiles.length > 0) {
    return sourceFiles.sort((a, b) => scoreFile(b) - scoreFile(a))[0];
  }

  return availableFiles.find((file) => !isDocFile(file) && !CONFIG_RE.test(file)) || availableFiles[0];
};

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

const escapeMermaidLabel = (value: string) =>
  value.replace(/"/g, "'").replace(/\n/g, "\\n");

const buildArchitectureMermaid = (
  graph: GitNexusGraphData,
  clusters: GitNexusCluster[],
  availableFiles: string[]
) => {
  const nodeLookup = buildNodeLookup(graph);
  const clusterEntries = clusters
    .map((cluster) => ({
      cluster,
      files: clusterFiles(cluster, graph, availableFiles),
    }))
    .filter((entry) => entry.files.length > 0)
    .slice(0, 4);

  if (clusterEntries.length < 2) return null;

  const fileToCluster = new Map<string, string>();
  clusterEntries.forEach(({ cluster, files }) => {
    files.forEach((file) => fileToCluster.set(file, cluster.id));
  });

  const edgeWeights = new Map<string, number>();
  const toFilePath = (nodeId: string) => nodeLookup.get(nodeId)?.filePath ?? nodeId;

  for (const edge of graph.edges) {
    const sourceFile = resolvePathAgainstFiles(toFilePath(edge.source), availableFiles);
    const targetFile = resolvePathAgainstFiles(toFilePath(edge.target), availableFiles);
    if (!sourceFile || !targetFile) continue;

    const sourceCluster = fileToCluster.get(sourceFile);
    const targetCluster = fileToCluster.get(targetFile);
    if (!sourceCluster || !targetCluster || sourceCluster === targetCluster) continue;

    const key = `${sourceCluster}->${targetCluster}`;
    edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
  }

  const lines = ["flowchart LR"];
  clusterEntries.forEach(({ cluster, files }, index) => {
    const label = `${cluster.label}\\n${files.length} files`;
    lines.push(`C${index}["${escapeMermaidLabel(label)}"]`);
  });

  const clusterIndex = new Map(clusterEntries.map(({ cluster }, index) => [cluster.id, index] as const));
  const weightedEdges = Array.from(edgeWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (weightedEdges.length > 0) {
    weightedEdges.forEach(([key]) => {
      const [sourceId, targetId] = key.split("->");
      const sourceIndex = clusterIndex.get(sourceId);
      const targetIndex = clusterIndex.get(targetId);
      if (sourceIndex === undefined || targetIndex === undefined) return;
      lines.push(`C${sourceIndex} --> C${targetIndex}`);
    });
  } else {
    for (let index = 0; index < clusterEntries.length - 1; index += 1) {
      lines.push(`C${index} --> C${index + 1}`);
    }
  }

  return lines.join("\n");
};

const buildProcessMermaid = (process: GitNexusProcess) => {
  if (!process.steps?.length) return null;
  const steps = process.steps.slice(0, 6);
  const lines = ["flowchart LR"];

  steps.forEach((step, index) => {
    const label = `${step.symbolName}\\n${step.filePath.split("/").pop() || step.filePath}`;
    lines.push(`P${index}["${escapeMermaidLabel(label)}"]`);
    if (index > 0) {
      lines.push(`P${index - 1} --> P${index}`);
    }
  });

  return lines.join("\n");
};

const sentenceCaseBullets = (values: string[]) =>
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.endsWith(".") ? value.slice(0, -1) : value);

const buildNarrationFromBlueprint = (
  scene: GraphTutorialSceneBlueprint,
  repoName: string
) => {
  const bullets = sentenceCaseBullets(scene.bulletPoints).slice(0, 3);
  const summary = bullets.join(". ");

  switch (scene.phase) {
    case "hook":
      return `Start with the big picture for ${repoName}. ${summary}. This opening scene frames what the project is trying to achieve before we dive into the moving parts that make it work.`;
    case "architecture":
      return `Before reading individual files, use this map to orient yourself. ${summary}. It gives the viewer a mental model for the layers, so the next code scenes feel connected instead of random.`;
    case "flow":
      return `This is the runtime path the code graph surfaced as the backbone of the repository. ${summary}. Follow this sequence as the story of the system, because the rest of the files mostly exist to support or refine these handoffs.`;
    case "deep_dive":
      return `This file matters because the graph ranked it as a hub in the codebase. ${summary}. Understanding this module usually unlocks the neighboring files, since many other parts of the repository depend on the decisions made here.`;
    case "details":
      return `Now we shift from headline features to operational details. ${summary}. These files are what turn a promising prototype into a maintainable product that can be configured, tested, and trusted over time.`;
    case "conclusion":
      return `Close by reconnecting the details to the whole repository. ${summary}. If you keep these anchors in mind, you can open the repo tomorrow and still know where to start reading.`;
    default:
      return `Walk through this part of ${repoName} with the viewer in mind. ${summary}.`;
  }
};

const sanitizeHighlightLines = (
  candidate: number[] | undefined,
  fallback: [number, number],
  filePath: string,
  fileContents: Record<string, string>
): [number, number] => {
  const totalLines = fileContents[filePath]?.split(/\r?\n/).length ?? 1;
  const source = candidate && candidate.length >= 2
    ? [candidate[0], candidate[candidate.length - 1]]
    : fallback;

  const start = Math.max(1, Math.min(totalLines, Math.round(source[0] || fallback[0])));
  const end = Math.max(start, Math.min(totalLines, Math.round(source[1] || fallback[1])));
  return [start, end];
};

const sceneDuration = (
  narrationText: string,
  fallbackDuration: number
) => {
  const words = countWords(narrationText);
  // Use 2.3 words/second + 3s buffer so dialogue is never truncated
  const bySpeechRate = Math.ceil(words / 2.3) + 3;
  return Math.max(fallbackDuration, bySpeechRate);
};

const isMeaningfulNarration = (value: string | undefined) =>
  Boolean(value && countWords(value) >= 18);

const isGenericTitle = (value: string | undefined) =>
  !value || /^scene\s+\d+/i.test(value.trim());

const sceneLookupByPath = (scenes: VideoScene[]) => {
  const map = new Map<string, VideoScene>();
  scenes.forEach((scene) => {
    if (!scene.file_path) return;
    map.set(scene.file_path, scene);
    map.set(normalizePath(scene.file_path), scene);
  });
  return map;
};

const buildSelectedExcerpts = (
  blueprint: GraphTutorialBlueprint,
  fileContents: Record<string, string>,
  maxChars: number
) => {
  const seen = new Set<string>();
  const chunks: string[] = [];

  for (const scene of blueprint.scenePlan) {
    if (seen.has(scene.filePath)) continue;
    seen.add(scene.filePath);

    const content = fileContents[scene.filePath];
    if (!content) continue;

    const lines = content.split(/\r?\n/);
    const [start, end] = scene.highlightLines ?? [1, Math.min(24, lines.length)];
    const excerptStart = Math.max(1, start - 6);
    const excerptEnd = Math.min(lines.length, end + 10);
    const excerpt = lines
      .slice(excerptStart - 1, excerptEnd)
      .map((line, index) => `${String(excerptStart + index).padStart(4, " ")} ${line}`)
      .join("\n");

    chunks.push(
      `--- ${scene.filePath} (lines ${excerptStart}-${excerptEnd}) ---\n${excerpt}`
    );

    if (chunks.join("\n\n").length >= maxChars) break;
  }

  const combined = chunks.join("\n\n");
  return combined.length > maxChars
    ? `${combined.slice(0, maxChars)}\n... (truncated)`
    : combined;
};

export function buildGraphTutorialBlueprint(
  graph: GitNexusGraphData | null | undefined,
  fileContents: Record<string, string>,
  repoName: string
): GraphTutorialBlueprint | null {
  if (!graph || !graph.nodes?.length) return null;

  const repoFiles = Object.keys(fileContents).sort();
  if (!repoFiles.length) return null;

  const importantFiles = uniqueStrings(
    getImportantFiles(graph).files
      .map((file) => resolvePathAgainstFiles(file, repoFiles))
  ).slice(0, 8);

  const readme = repoFiles.find((file) => DOC_RE.test(file));
  const entryFromSummary = graph.summary?.entryPoints
    ?.map((file) => resolvePathAgainstFiles(file, repoFiles))
    .find(Boolean) ?? null;
  const entryFile = entryFromSummary
    || pickFirstMatchingFile(repoFiles, ENTRY_PATTERNS)
    || importantFiles[0]
    || readme
    || repoFiles[0];

  const clusterEntries = (graph.clusters ?? [])
    .map((cluster) => ({
      cluster,
      files: clusterFiles(cluster, graph, repoFiles),
      score: (cluster.fileCount ?? cluster.members.length) + (cluster.totalLines ?? 0) / 200,
    }))
    .filter(({ files, cluster }) => {
      if (!files.length) return false;
      return !["docs", "assets", "build"].includes((cluster.kind ?? "").toLowerCase());
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const process = (graph.processes ?? [])
    .filter((candidate) => candidate.steps?.length >= 2)
    .sort((a, b) => (b.steps?.length ?? 0) - (a.steps?.length ?? 0))[0];

  const processFiles = uniqueStrings(process?.steps.map((step) =>
    resolvePathAgainstFiles(step.filePath, repoFiles)
  ) ?? []);

  const clusterRepresentativeFiles = clusterEntries
    .map(({ files }) => {
      const rankedClusterFile = importantFiles.find((candidate) => files.includes(candidate));
      return rankedClusterFile ?? files[0];
    })
    .filter(Boolean) as string[];

  const heroFile = pickHeroCodeFile(
    repoFiles,
    [entryFile, ...importantFiles, ...processFiles, ...clusterRepresentativeFiles],
    graph
  );

  const complexityScore =
    (graph.summary?.totalFiles ?? repoFiles.length) / 18 +
    (graph.summary?.totalSymbols ?? graph.nodes.length) / 55 +
    (graph.summary?.totalEdges ?? graph.edges.length) / 100 +
    clusterEntries.length * 0.8 +
    (process ? 1.6 : 0);

  const deepDiveTarget = complexityScore > 12 ? 8 : complexityScore > 8 ? 7 : complexityScore > 5 ? 6 : 5;
  const deepDiveFiles = uniqueStrings([
    ...processFiles,
    ...importantFiles,
    ...clusterRepresentativeFiles,
  ]).filter((file) => file !== readme && file !== entryFile).slice(0, deepDiveTarget);

  const detailFiles = uniqueStrings([
    repoFiles.find((file) => TEST_FILE_RE.test(file) || TEST_NAME_RE.test(file)),
    repoFiles.find((file) => CONFIG_RE.test(file) && file !== entryFile),
    readme && readme !== entryFile ? readme : null,
    // For complex repos, add a second config/doc file
    complexityScore > 8 ? repoFiles.find((file) => DOC_RE.test(file) && file !== readme && !deepDiveFiles.includes(file)) : null,
  ]).filter((file) => file !== entryFile && !deepDiveFiles.includes(file)).slice(0, 3);

  const architectureMermaid = buildArchitectureMermaid(
    graph,
    clusterEntries.map(({ cluster }) => cluster),
    repoFiles
  );
  const processMermaid = process ? buildProcessMermaid(process) : null;

  const scenePlan: GraphTutorialSceneBlueprint[] = [];

  const overviewBullets = uniqueStrings([
    graph.summary?.readmeSummary
      ?.split(/[.!?]/)
      .map((part) => part.trim())
      .find(Boolean),
    graph.summary?.architecturePattern
      ? `Architecture pattern: ${graph.summary.architecturePattern}`
      : null,
    graph.summary?.keyTechnologies?.length
      ? `Main stack: ${graph.summary.keyTechnologies.slice(0, 4).join(", ")}`
      : null,
    entryFile ? `Best place to start reading: ${entryFile}` : null,
  ]).slice(0, 4);

  const hookNarrationBrief = `Open on a real source file that immediately shows what this project makes possible. Explain the problem the repository solves, who it is for, and why this particular file is a strong lens into the codebase. Mention the key technologies ${graph.summary?.keyTechnologies?.slice(0, 3).join(", ") || "used"} and the architecture style ${graph.summary?.architecturePattern || "of this codebase"}, but keep the viewer's eyes on the actual code that proves it.`;
  scenePlan.push({
    id: "hook",
    phase: "hook",
    type: "intro",
    visualType: "code",
    filePath: heroFile,
    title: "What This Project Actually Does",
    durationSeconds: dynamicSceneDuration(hookNarrationBrief, overviewBullets, "code", "hook"),
    highlightLines: buildHighlightLines(heroFile, fileContents, getRepresentativeSymbol(graph, heroFile)),
    bulletPoints: overviewBullets.length > 0
      ? overviewBullets
      : [`This walkthrough starts from ${heroFile} and expands outward through the main modules.`],
    focusSymbols: uniqueStrings([getRepresentativeSymbol(graph, heroFile)?.name]),
    narrationBrief: hookNarrationBrief,
  });

  if (architectureMermaid) {
    const archBullets = clusterEntries.map(({ cluster, files }) =>
      `${cluster.label}: ${cluster.description ?? `${files.length} files grouped around ${cluster.kind ?? "one subsystem"}`}`
    ).slice(0, 4);
    const archNarrationBrief = `Walk through this architecture diagram layer by layer. Explain what each cluster does: ${archBullets.join("; ")}. Describe the arrows between clusters — what data or calls flow between them. This map gives viewers a mental model for the rest of the walkthrough.`;
    scenePlan.push({
      id: "architecture-map",
      phase: "architecture",
      type: "overview",
      visualType: "diagram",
      filePath: entryFile,
      title: "Architecture Map",
      durationSeconds: dynamicSceneDuration(archNarrationBrief, archBullets, "diagram", "architecture"),
      bulletPoints: archBullets,
      focusSymbols: [],
      diagram: {
        mermaid: architectureMermaid,
        caption: "Code-graph clusters reveal the main subsystems and their dependencies.",
      },
      narrationBrief: archNarrationBrief,
    });
  }

  const entrySymbol = getRepresentativeSymbol(graph, entryFile);
  const entryBullets = uniqueStrings([
    `This is the starting point that wires the first user-visible behavior together.`,
    entrySymbol?.name ? `Look for ${entrySymbol.name} as the first anchor in the file.` : null,
    graph.summary?.entryPoints?.length ? `The graph flagged this file as an entry point.` : null,
    entrySymbol?.docstring ? entrySymbol.docstring.split('.')[0] : null,
  ]);
  const entryNarrationBrief = `Explain how the app boots by walking through ${entryFile}. ${entrySymbol?.name ? `Focus on the ${entrySymbol.name} ${entrySymbol?.kind?.toLowerCase() || "symbol"} which is the primary anchor.` : ""} Describe what this file coordinates: which modules it imports, what it initializes, and how it hands off to the rest of the system. ${entrySymbol?.docstring ? `The code documents it as: ${entrySymbol.docstring.substring(0, 100)}.` : ""}`;
  scenePlan.push({
    id: "entry",
    phase: "architecture",
    type: "entry",
    visualType: "code",
    filePath: entryFile,
    title: `Where Execution Begins`,
    durationSeconds: dynamicSceneDuration(entryNarrationBrief, entryBullets, "code", "architecture"),
    highlightLines: buildHighlightLines(entryFile, fileContents, entrySymbol),
    bulletPoints: entryBullets,
    focusSymbols: uniqueStrings([entrySymbol?.name]),
    narrationBrief: entryNarrationBrief,
  });

  if (process && processMermaid) {
    const flowBullets = process.steps
      .slice(0, 5)
      .map((step, index) => `Step ${index + 1}: ${step.symbolName} in ${step.filePath.split("/").pop() || step.filePath}${step.codeSnippet ? ` — ${step.codeSnippet.split('\n')[0].trim().substring(0, 60)}` : ""}`);
    const flowNarrationBrief = `Walk through the primary execution flow "${process.name || "Main Flow"}" step by step. ${process.description ? `This flow represents: ${process.description}.` : ""} For each step, explain what the function does, what data it receives, and how it passes control forward. The steps are: ${flowBullets.join("; ")}. This is the backbone of how the application processes a request from start to finish.`;
    scenePlan.push({
      id: "runtime-flow",
      phase: "flow",
      type: "feature",
      visualType: "diagram",
      filePath: resolvePathAgainstFiles(process.steps[0]?.filePath, repoFiles) ?? entryFile,
      title: process.name || "Main Runtime Flow",
      durationSeconds: dynamicSceneDuration(flowNarrationBrief, flowBullets, "diagram", "flow"),
      bulletPoints: flowBullets,
      focusSymbols: process.steps.slice(0, 5).map((step) => step.symbolName),
      diagram: {
        mermaid: processMermaid,
        caption: process.description || "This is the strongest end-to-end flow surfaced by the code graph.",
      },
      narrationBrief: flowNarrationBrief,
    });
  }

  deepDiveFiles.forEach((filePath, index) => {
    const symbol = getRepresentativeSymbol(graph, filePath);
    const fileNode = getFileNode(graph, filePath);
    const allFileSymbols = getFileSymbols(graph, filePath).slice(0, 5);
    const connectivity = fileConnectivity(graph, filePath);
    const role = fileRoleLabel(filePath, fileNode);
    const sceneType: VideoScene["type"] = index < 2 ? "core" : "feature";

    const ddBullets = uniqueStrings([
      `Role in the repo: ${role}`,
      symbol?.name ? `Key symbol: ${symbol.name}${symbol.kind ? ` (${symbol.kind})` : ""}` : null,
      connectivity.importers > 0 ? `Referenced by ${connectivity.importers} neighboring modules` : null,
      connectivity.dependencies > 0 ? `Delegates work to ${connectivity.dependencies} downstream modules` : null,
      symbol?.docstring ? symbol.docstring.split('.')[0] : null,
      allFileSymbols.length > 1 ? `Other symbols: ${allFileSymbols.slice(1, 4).map(s => s.name).join(", ")}` : null,
    ]).slice(0, 5);
    const ddNarrationBrief = `Deep-dive into ${filePath.split("/").pop() || filePath} which serves as the ${role}. ${symbol?.name ? `The primary symbol is ${symbol.name} (${symbol.kind || "function"}).` : ""} ${symbol?.docstring ? `According to its documentation: ${symbol.docstring.substring(0, 120)}.` : ""} ${connectivity.importers > 0 ? `This is a hub file — ${connectivity.importers} other modules depend on it.` : ""} ${connectivity.dependencies > 0 ? `It delegates to ${connectivity.dependencies} downstream modules.` : ""} Explain why this file matters, what decisions it centralizes, and what a new developer should read first.`;
    scenePlan.push({
      id: `deep-dive-${index + 1}`,
      phase: "deep_dive",
      type: sceneType,
      visualType: "code",
      filePath,
      title: `${humanizeName(filePath.split("/").pop() || filePath)} As A Hub`,
      durationSeconds: dynamicSceneDuration(ddNarrationBrief, ddBullets, "code", "deep_dive"),
      highlightLines: buildHighlightLines(filePath, fileContents, symbol),
      bulletPoints: ddBullets,
      focusSymbols: uniqueStrings([symbol?.name, ...(allFileSymbols.slice(1, 3).map(s => s.name))]),
      narrationBrief: ddNarrationBrief,
    });
  });

  detailFiles.forEach((filePath, index) => {
    const symbol = getRepresentativeSymbol(graph, filePath);
    const detailKind = TEST_FILE_RE.test(filePath) || TEST_NAME_RE.test(filePath)
      ? "tests"
      : CONFIG_RE.test(filePath)
        ? "configuration"
        : "documentation";

    const detailBullets = uniqueStrings([
      `Operational focus: ${detailKind}`,
      symbol?.name ? `Useful symbol: ${symbol.name}` : null,
      `This file explains how the project stays reliable outside the happy path.`,
    ]);
    const detailNarrationBrief = `Shift to the operational side of the repository. This ${detailKind} file (${filePath.split("/").pop() || filePath}) ${detailKind === "tests" ? "verifies that the main behavior works correctly" : detailKind === "configuration" ? "controls how the system is set up and deployed" : "documents the project for other contributors"}. ${symbol?.name ? `Look for ${symbol.name} to understand the structure.` : ""} Explain why this file matters for long-term maintainability.`;
    scenePlan.push({
      id: `detail-${index + 1}`,
      phase: "details",
      type: "support",
      visualType: "code",
      filePath,
      title: `${humanizeName(filePath.split("/").pop() || filePath)} For ${humanizeName(detailKind)}`,
      durationSeconds: dynamicSceneDuration(detailNarrationBrief, detailBullets, "code", "details"),
      highlightLines: buildHighlightLines(filePath, fileContents, symbol),
      bulletPoints: detailBullets,
      focusSymbols: uniqueStrings([symbol?.name]),
      narrationBrief: detailNarrationBrief,
    });
  });

  const closingAnchors = uniqueStrings([
    entryFile,
    deepDiveFiles[0],
    importantFiles[0],
  ]).slice(0, 3);

  const closingBullets = uniqueStrings([
    closingAnchors.length ? `Read next: ${closingAnchors.join(" -> ")}` : null,
    graph.summary?.hubFiles?.length ? `Core hubs surfaced by the graph: ${importantFiles.slice(0, 3).join(", ")}` : null,
    `Keep the architecture map and runtime flow in mind while exploring the rest of the codebase.`,
  ]).slice(0, 3);
  const closingNarrationBrief = `Wrap up by summarizing what the viewer has learned. Recap the architecture, the main entry point, and the runtime flow. Then recommend which files to open next: ${closingAnchors.join(", ")}. ${graph.summary?.hubFiles?.length ? `The graph identified these as the most critical hub files: ${importantFiles.slice(0, 3).join(", ")}.` : ""} Close by connecting the details back to the big picture.`;
  scenePlan.push({
    id: "conclusion",
    phase: "conclusion",
    type: "wrap_up",
    visualType: "overview",
    filePath: readme ?? entryFile,
    title: "How To Read This Repo Next",
    durationSeconds: dynamicSceneDuration(closingNarrationBrief, closingBullets, "overview", "conclusion"),
    highlightLines: buildHighlightLines(readme ?? entryFile, fileContents),
    bulletPoints: closingBullets,
    focusSymbols: [],
    narrationBrief: closingNarrationBrief,
  });

  return {
    title: `${repoName} Walkthrough`,
    overview: uniqueStrings([
      graph.summary?.readmeSummary,
      graph.summary?.architecturePattern ? `Architecture: ${graph.summary.architecturePattern}` : null,
      graph.summary?.keyTechnologies?.length
        ? `Technologies: ${graph.summary.keyTechnologies.slice(0, 5).join(", ")}`
        : null,
    ]).join(" "),
    suggestedDurationSeconds: scenePlan.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    repoFiles,
    importantFiles,
    selectedFiles: uniqueStrings(scenePlan.map((scene) => scene.filePath)),
    scenePlan,
  };
}

export function buildTutorialContextDigest(
  blueprint: GraphTutorialBlueprint,
  fileContents: Record<string, string>,
  maxChars: number
) {
  const fileList = blueprint.repoFiles.join("\n");
  const blueprintSummary = blueprint.scenePlan
    .map((scene, index) => {
      const focus = scene.focusSymbols.length ? ` | symbols: ${scene.focusSymbols.join(", ")}` : "";
      return `${index + 1}. [${scene.phase}/${scene.visualType}] ${scene.title} -> ${scene.filePath}${focus}`;
    })
    .join("\n");

  const excerpts = buildSelectedExcerpts(
    blueprint,
    fileContents,
    Math.max(4_000, maxChars - 4_000)
  );

  const digest = `FILES:\n${fileList}\n\nGRAPH-BACKED TUTORIAL PLAN:\n${blueprintSummary}\n\nSCENE-FOCUSED EXCERPTS:\n${excerpts}`;
  return digest.length > maxChars
    ? `${digest.slice(0, maxChars)}\n... (truncated)`
    : digest;
}

export function buildManifestFromBlueprint(
  blueprint: GraphTutorialBlueprint,
  repoName: string
): VideoManifest {
  const scenes: VideoScene[] = blueprint.scenePlan.map((scene, index) => {
    const narrationText = buildNarrationFromBlueprint(scene, repoName);
    return {
      id: index + 1,
      type: scene.type,
      phase: scene.phase,
      visual_type: scene.visualType,
      file_path: scene.filePath,
      highlight_lines: scene.highlightLines,
      narration_text: narrationText,
      duration_seconds: sceneDuration(narrationText, scene.durationSeconds),
      title: scene.title,
      code: "",
      bullet_points: scene.bulletPoints,
      focus_symbols: scene.focusSymbols,
      diagram: scene.diagram,
    };
  });

  return {
    title: blueprint.title || `${repoName} Walkthrough`,
    repo_files: blueprint.repoFiles,
    scenes,
  };
}

export function mergeManifestWithBlueprint(
  manifest: VideoManifest,
  blueprint: GraphTutorialBlueprint,
  fileContents: Record<string, string>,
  repoName: string
): VideoManifest {
  const fallback = buildManifestFromBlueprint(blueprint, repoName);
  const candidateScenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  const candidateLookup = sceneLookupByPath(candidateScenes);

  // Build lookup by phase for smarter matching instead of relying on index order
  // Group by phase since there can be multiple deep_dive scenes
  const candidatesByPhase = new Map<string, VideoScene[]>();
  candidateScenes.forEach((s) => {
    const phase = (s as any).phase || '';
    if (phase) {
      const arr = candidatesByPhase.get(phase) || [];
      arr.push(s);
      candidatesByPhase.set(phase, arr);
    }
  });
  // Track which phase index we've consumed
  const phaseConsumed = new Map<string, number>();

  const mergedScenes = fallback.scenes.map((fallbackScene, index) => {
    const blueprintScene = blueprint.scenePlan[index];
    const phase = blueprintScene.phase;

    // Try phase match first: take next unconsumed candidate of this phase
    let candidate: VideoScene | undefined;
    const phaseCandidates = candidatesByPhase.get(phase);
    if (phaseCandidates && phaseCandidates.length > 0) {
      const consumed = phaseConsumed.get(phase) || 0;
      if (consumed < phaseCandidates.length) {
        candidate = phaseCandidates[consumed];
        phaseConsumed.set(phase, consumed + 1);
      }
    }

    // Fallback: match by file path
    if (!candidate) {
      candidate = candidateLookup.get(fallbackScene.file_path)
        || candidateLookup.get(normalizePath(fallbackScene.file_path));
    }

    // Last resort: use index mapping
    if (!candidate && candidateScenes[index]) {
      candidate = candidateScenes[index];
    }

    const narrationText = isMeaningfulNarration(candidate?.narration_text)
      ? candidate!.narration_text
      : fallbackScene.narration_text;

    const title = !isGenericTitle(candidate?.title)
      ? candidate!.title
      : fallbackScene.title;

    const bulletPoints = uniqueStrings([
      ...(candidate?.bullet_points ?? []),
      ...(fallbackScene.bullet_points ?? []),
    ]).slice(0, 4);

    const focusSymbols = uniqueStrings([
      ...(candidate?.focus_symbols ?? []),
      ...(fallbackScene.focus_symbols ?? []),
    ]);

    const mergedDiagram = fallbackScene.diagram || candidate?.diagram
      ? {
          mermaid: fallbackScene.diagram?.mermaid || candidate?.diagram?.mermaid || "",
          caption: candidate?.diagram?.caption || fallbackScene.diagram?.caption,
        }
      : undefined;

    const fallbackHighlight = blueprintScene.highlightLines ?? fallbackScene.highlight_lines ?? [1, 1];

    return {
      ...fallbackScene,
      id: index + 1,
      type: fallbackScene.type,
      phase: fallbackScene.phase,
      visual_type: fallbackScene.visual_type,
      title,
      narration_text: narrationText,
      duration_seconds: sceneDuration(
        narrationText,
        Math.max(
          Number(candidate?.duration_seconds) || 0,
          fallbackScene.duration_seconds || blueprintScene.durationSeconds
        )
      ),
      highlight_lines: sanitizeHighlightLines(
        candidate?.highlight_lines,
        fallbackHighlight,
        fallbackScene.file_path,
        fileContents
      ),
      bullet_points: bulletPoints,
      focus_symbols: focusSymbols,
      diagram: mergedDiagram,
    };
  });

  return {
    ...manifest,
    title: manifest.title || fallback.title,
    repo_files: blueprint.repoFiles,
    scenes: mergedScenes,
  };
}
