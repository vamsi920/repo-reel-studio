import {
  buildSceneSourceRefs,
  getCodeExcerptForRef,
  getRelatedFilesForFile,
  humanizeFileLabel,
  isConfigFile,
  isSourceCodeFile,
  isTestFile,
} from "@/lib/repoEvidence";
import {
  getRelevantCodegraphEntities,
  getRelevantCodegraphModules,
} from "@/lib/upstreamCodegraph";
import type {
  GitNexusGraphData,
  RepoContextCapsule,
  RepoEvidenceBundle,
  RepoKnowledgeEdge,
  RepoKnowledgeGraph,
  RepoKnowledgeNode,
  RepoKnowledgeNodeKind,
  RepoReadingPath,
  SourceRef,
  TutorialPhase,
  VideoVisualKind,
} from "@/lib/types";

const uniqueStrings = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.trim())
    )
  );

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toSentenceCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const buildFileTags = (
  filePath: string,
  evidence: RepoEvidenceBundle
) => {
  const tags = new Set<string>();
  if (evidence.entry_candidates.includes(filePath)) tags.add("entry");
  if (evidence.hub_files.includes(filePath)) tags.add("hub");
  if (evidence.opener_candidates.some((candidate) => candidate.file_path === filePath)) {
    tags.add("opener");
  }
  if (isConfigFile(filePath)) tags.add("config");
  if (isTestFile(filePath)) tags.add("test");
  if (isSourceCodeFile(filePath)) tags.add("source");
  return Array.from(tags);
};

const createFileSummary = (
  filePath: string,
  evidence: RepoEvidenceBundle
) => {
  const roles = buildFileTags(filePath, evidence)
    .filter((tag) => tag !== "source")
    .map((tag) => toSentenceCase(tag));
  if (roles.length > 0) {
    return `${humanizeFileLabel(filePath)} is a ${roles.join(", ").toLowerCase()} anchor in the repository.`;
  }
  return `${humanizeFileLabel(filePath)} is one of the files that explains how the repository works.`;
};

const buildSnippetSummary = (
  ref: SourceRef,
  fileContents: Record<string, string>
) => {
  const excerpt = getCodeExcerptForRef(fileContents, ref)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!excerpt) {
    return `${humanizeFileLabel(ref.file_path)} lines ${ref.start_line}-${ref.end_line}`;
  }
  return `${humanizeFileLabel(ref.file_path)} lines ${ref.start_line}-${ref.end_line}: ${excerpt.slice(0, 110)}`;
};

const addNode = (
  nodes: RepoKnowledgeNode[],
  node: RepoKnowledgeNode
) => {
  if (!nodes.some((candidate) => candidate.id === node.id)) {
    nodes.push(node);
  }
};

const addEdge = (
  edges: RepoKnowledgeEdge[],
  edge: RepoKnowledgeEdge
) => {
  if (
    !edges.some(
      (candidate) =>
        candidate.source === edge.source &&
        candidate.target === edge.target &&
        candidate.type === edge.type
    )
  ) {
    edges.push(edge);
  }
};

const createCapsule = ({
  id,
  purpose,
  phase,
  title,
  summary,
  teachingGoal,
  filePaths,
  sourceRefs,
  relatedNodeIds,
  tags,
  importance,
  visualKind,
  clusterId,
  processId,
}: {
  id: string;
  purpose: RepoContextCapsule["purpose"];
  phase: TutorialPhase;
  title: string;
  summary: string;
  teachingGoal: string;
  filePaths: string[];
  sourceRefs: SourceRef[];
  relatedNodeIds: string[];
  tags: string[];
  importance: number;
  visualKind?: VideoVisualKind;
  clusterId?: string;
  processId?: string;
}): RepoContextCapsule => ({
  id,
  purpose,
  phase,
  title,
  summary,
  teaching_goal: teachingGoal,
  file_paths: uniqueStrings(filePaths),
  source_refs: sourceRefs,
  related_node_ids: uniqueStrings(relatedNodeIds),
  tags: uniqueStrings(tags),
  importance,
  visual_kind: visualKind,
  cluster_id: clusterId,
  process_id: processId,
});

const buildReadingPaths = (
  repoName: string,
  evidence: RepoEvidenceBundle,
  strategicFiles: string[]
): RepoReadingPath[] => {
  const opener = evidence.opener_candidates[0]?.file_path;
  const readingPaths: RepoReadingPath[] = [];

  if (opener) {
    const filePaths = uniqueStrings([
      opener,
      ...evidence.entry_candidates.slice(0, 2),
      ...evidence.hub_files.slice(0, 2),
    ]).slice(0, 5);

    readingPaths.push({
      id: "reading-path-start-here",
      title: "Start Here",
      description: `The fastest way to understand ${repoName} is to open the strongest source anchor, then follow the startup and hub files.`,
      goal: "Get productive quickly with the minimum reading path.",
      file_paths: filePaths,
      node_ids: filePaths.map((filePath) => `file:${filePath}`),
    });
  }

  evidence.process_flows.slice(0, 2).forEach((process, index) => {
    const filePaths = uniqueStrings(process.steps.map((step) => step.file_path)).slice(0, 6);
    readingPaths.push({
      id: `reading-path-flow-${index + 1}`,
      title: process.name,
      description: process.description || "Read the execution path in runtime order.",
      goal: "Trace how a real request or command moves through the codebase.",
      file_paths: filePaths,
      node_ids: filePaths.map((filePath) => `file:${filePath}`),
    });
  });

  if (readingPaths.length === 0 && strategicFiles.length > 0) {
    const filePaths = strategicFiles.slice(0, 5);
    readingPaths.push({
      id: "reading-path-core-tour",
      title: "Core Tour",
      description: `A fallback reading path through the most important files in ${repoName}.`,
      goal: "Understand the main modules even when runtime flow extraction is weak.",
      file_paths: filePaths,
      node_ids: filePaths.map((filePath) => `file:${filePath}`),
    });
  }

  return readingPaths;
};

export const buildRepoKnowledgeGraph = (
  repoName: string,
  evidence: RepoEvidenceBundle,
  fileContents: Record<string, string>,
  graphData?: GitNexusGraphData | null
): RepoKnowledgeGraph => {
  const nodes: RepoKnowledgeNode[] = [];
  const edges: RepoKnowledgeEdge[] = [];
  const contextCapsules: RepoContextCapsule[] = [];
  const codegraphModules = getRelevantCodegraphModules(
    graphData,
    [],
    "architecture",
    8
  );
  const codegraphEntities = getRelevantCodegraphEntities(
    graphData,
    [],
    "architecture",
    16
  );
  const graphSymbols = graphData?.nodes?.filter((node) => node.kind !== "File") ?? [];
  const strategicFiles = uniqueStrings([
    ...evidence.opener_candidates.map((candidate) => candidate.file_path),
    ...evidence.entry_candidates,
    ...evidence.hub_files,
    ...codegraphModules.map((module) => module.fullPath),
    ...evidence.cluster_summaries.map((cluster) => cluster.representative_file),
    ...evidence.cluster_summaries.flatMap((cluster) => cluster.file_paths.slice(0, 2)),
    ...evidence.process_flows.flatMap((process) => process.steps.map((step) => step.file_path)),
    ...evidence.snippet_catalog.map((snippet) => snippet.file_path),
    ...evidence.repo_facts.flatMap((fact) => fact.source_refs.map((ref) => ref.file_path)),
  ])
    .filter((filePath) => filePath && fileContents[filePath])
    .slice(0, clamp(evidence.source_files.length, 12, 36));

  addNode(nodes, {
    id: "repo:root",
    kind: "repo",
    label: repoName,
    summary: `${repoName} has ${evidence.repo_stats?.total_source_files || 0} source files and ${evidence.cluster_summaries.length} major structural areas.`,
    tags: ["repository"],
    score: 100,
  });

  if (evidence.repo_stats?.architecture_pattern) {
    addNode(nodes, {
      id: "architecture:primary",
      kind: "architecture",
      label: evidence.repo_stats.architecture_pattern,
      summary: `The code graph points to a ${evidence.repo_stats.architecture_pattern} shape.`,
      score: 90,
    });
    addEdge(edges, {
      source: "repo:root",
      target: "architecture:primary",
      type: "HAS_ARCHITECTURE",
      weight: 1,
      rationale: "Derived from code graph architecture detection.",
    });
  }

  (evidence.repo_stats?.key_technologies || []).slice(0, 8).forEach((technology) => {
    const id = `technology:${technology.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    addNode(nodes, {
      id,
      kind: "technology",
      label: technology,
      summary: `${technology} appears in the repository technology stack.`,
      score: 75,
    });
    addEdge(edges, {
      source: "repo:root",
      target: id,
      type: "USES_TECHNOLOGY",
      weight: 0.8,
    });
  });

  const ensureFileNode = (filePath: string, score = 60) => {
    const fileNodeId = `file:${filePath}`;
    const sourceRefs = buildSceneSourceRefs(
      [filePath],
      evidence,
      fileContents,
      graphData,
      "Knowledge graph file anchor"
    );
    addNode(nodes, {
      id: fileNodeId,
      kind: "file",
      label: humanizeFileLabel(filePath),
      summary: createFileSummary(filePath, evidence),
      file_path: filePath,
      score,
      tags: buildFileTags(filePath, evidence),
      source_refs: sourceRefs,
    });
    addEdge(edges, {
      source: "repo:root",
      target: fileNodeId,
      type: "HIGHLIGHTS_FILE",
      weight: score / 100,
    });
    return fileNodeId;
  };

  strategicFiles.forEach((filePath, index) => {
    const openerScore =
      evidence.opener_candidates.find((candidate) => candidate.file_path === filePath)?.score || 0;
    const roleBoost =
      (evidence.entry_candidates.includes(filePath) ? 16 : 0) +
      (evidence.hub_files.includes(filePath) ? 12 : 0);
    ensureFileNode(filePath, clamp(48 + openerScore + roleBoost - index, 35, 100));
  });

  evidence.cluster_summaries.forEach((cluster, index) => {
    const clusterId = `cluster:${cluster.cluster_id}`;
    const representativeFile =
      cluster.representative_file || cluster.file_paths[0] || strategicFiles[0];
    const sourceRefs = representativeFile
      ? buildSceneSourceRefs(
          [representativeFile],
          evidence,
          fileContents,
          graphData,
          `${cluster.label} representative`
        )
      : [];

    addNode(nodes, {
      id: clusterId,
      kind: "cluster",
      label: cluster.label,
      summary:
        cluster.description ||
        `${cluster.label} contains ${cluster.member_count} files and represents one of the repository's major areas.`,
      file_path: representativeFile,
      score: clamp(90 - index * 5, 60, 95),
      tags: ["cluster"],
      source_refs: sourceRefs,
    });
    addEdge(edges, {
      source: "repo:root",
      target: clusterId,
      type: "HAS_CLUSTER",
      weight: clamp(cluster.member_count / 6, 0.4, 1),
    });

    cluster.file_paths.slice(0, 5).forEach((filePath) => {
      const fileNodeId = ensureFileNode(filePath, 70 - index * 3);
      addEdge(edges, {
        source: clusterId,
        target: fileNodeId,
        type: "SUPPORTS",
        weight: 0.8,
        rationale: `${filePath} belongs to ${cluster.label}.`,
      });
    });

    contextCapsules.push(
      createCapsule({
        id: `capsule-cluster-${cluster.cluster_id}`,
        purpose: "architecture",
        phase: "architecture",
        title: `Architecture: ${cluster.label}`,
        summary:
          cluster.description ||
          `${cluster.label} is a major subsystem in ${repoName}.`,
        teachingGoal: "Explain the main structural area and what responsibility lives there.",
        filePaths: cluster.file_paths,
        sourceRefs,
        relatedNodeIds: [clusterId, ...cluster.file_paths.map((filePath) => `file:${filePath}`)],
        tags: ["cluster", cluster.label.toLowerCase()],
        importance: clamp(92 - index * 4, 62, 92),
        visualKind: "diagram",
        clusterId: cluster.cluster_id,
      })
    );
  });

  evidence.process_flows.forEach((process, index) => {
    const processId = `process:${process.id}`;
    const filePaths = uniqueStrings(process.steps.map((step) => step.file_path)).slice(0, 6);
    const sourceRefs = buildSceneSourceRefs(
      filePaths,
      evidence,
      fileContents,
      graphData,
      `${process.name} flow`
    );

    addNode(nodes, {
      id: processId,
      kind: "process",
      label: process.name,
      summary:
        process.description ||
        `${process.name} is a graph-derived runtime path through the repository.`,
      file_path: filePaths[0],
      score: clamp(88 - index * 5, 60, 90),
      tags: ["flow"],
      source_refs: sourceRefs,
    });
    addEdge(edges, {
      source: "repo:root",
      target: processId,
      type: "HAS_PROCESS",
      weight: 0.9,
    });

    filePaths.forEach((filePath, stepIndex) => {
      const fileNodeId = ensureFileNode(filePath, 76 - stepIndex * 4);
      addEdge(edges, {
        source: processId,
        target: fileNodeId,
        type: "READ_NEXT",
        weight: clamp(1 - stepIndex * 0.08, 0.4, 1),
        rationale: `${filePath} appears in the flow ${process.name}.`,
      });
    });

    contextCapsules.push(
      createCapsule({
        id: `capsule-process-${process.id}`,
        purpose: "flow",
        phase: "flow",
        title: process.name,
        summary:
          process.description ||
          `This flow shows how work moves through ${repoName}.`,
        teachingGoal: "Walk through the runtime sequence without leaving the code evidence.",
        filePaths,
        sourceRefs,
        relatedNodeIds: [processId, ...filePaths.map((filePath) => `file:${filePath}`)],
        tags: ["flow", "runtime"],
        importance: clamp(89 - index * 4, 58, 89),
        visualKind: "diagram",
        processId: process.id,
      })
    );
  });

  evidence.repo_facts.forEach((fact, index) => {
    const factId = `fact:${fact.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    addNode(nodes, {
      id: factId,
      kind: "fact",
      label: fact.label,
      summary: fact.value,
      file_path: fact.source_refs[0]?.file_path,
      score: clamp(74 - index * 3, 45, 80),
      tags: ["fact"],
      source_refs: fact.source_refs,
    });
    addEdge(edges, {
      source: "repo:root",
      target: factId,
      type: "HAS_FACT",
      weight: 0.7,
    });
  });

  evidence.snippet_catalog.slice(0, 24).forEach((snippet, index) => {
    const snippetId = `snippet:${snippet.id}`;
    const ref: SourceRef = {
      file_path: snippet.file_path,
      start_line: snippet.start_line,
      end_line: snippet.end_line,
      symbol_name: snippet.symbol_name,
      reason: snippet.role,
    };
    addNode(nodes, {
      id: snippetId,
      kind: "snippet",
      label: `${humanizeFileLabel(snippet.file_path)} lines ${snippet.start_line}-${snippet.end_line}`,
      summary: buildSnippetSummary(ref, fileContents),
      file_path: snippet.file_path,
      symbol_name: snippet.symbol_name,
      score: clamp((snippet.score || 40) - index, 25, 90),
      tags: uniqueStrings([snippet.role, "snippet"]),
      source_refs: [ref],
    });
    addEdge(edges, {
      source: `file:${snippet.file_path}`,
      target: snippetId,
      type: "HAS_SNIPPET",
      weight: clamp((snippet.score || 40) / 100, 0.3, 0.9),
    });
  });

  graphSymbols
    .filter((symbol) => strategicFiles.includes(symbol.filePath))
    .sort((a, b) => (b.complexity || 0) - (a.complexity || 0))
    .slice(0, 20)
    .forEach((symbol, index) => {
      const symbolId = `symbol:${symbol.filePath}:${symbol.name}`;
      const ref: SourceRef = {
        file_path: symbol.filePath,
        start_line: symbol.startLine || 1,
        end_line: Math.max(symbol.startLine || 1, (symbol.startLine || 1) + 12),
        symbol_name: symbol.name,
        reason: `${symbol.kind} anchor`,
      };
      addNode(nodes, {
        id: symbolId,
        kind: "symbol",
        label: symbol.name,
        summary:
          symbol.docstring ||
          `${symbol.name} is one of the more important ${symbol.kind.toLowerCase()} anchors in ${humanizeFileLabel(symbol.filePath)}.`,
        file_path: symbol.filePath,
        symbol_name: symbol.name,
        score: clamp((symbol.complexity || 0) + 35 - index, 30, 88),
        tags: uniqueStrings([symbol.kind.toLowerCase(), "symbol"]),
        source_refs: [ref],
      });
      addEdge(edges, {
        source: `file:${symbol.filePath}`,
        target: symbolId,
        type: "HIGHLIGHTS_SYMBOL",
        weight: clamp(((symbol.complexity || 0) + 10) / 60, 0.4, 0.95),
      });
    });

  const opener = evidence.opener_candidates[0];
  if (opener?.file_path) {
    const relatedFiles = uniqueStrings([
      opener.file_path,
      ...getRelatedFilesForFile(
        graphData,
        opener.file_path,
        evidence.repo_tree,
        4
      ),
      ...evidence.entry_candidates.slice(0, 2),
    ]);
    const sourceRefs = buildSceneSourceRefs(
      relatedFiles.slice(0, 4),
      evidence,
      fileContents,
      graphData,
      "Opening context"
    );
    contextCapsules.push(
      createCapsule({
        id: "capsule-hook",
        purpose: "hook",
        phase: "hook",
        title: `Start Here: ${humanizeFileLabel(opener.file_path)}`,
        summary: `${humanizeFileLabel(opener.file_path)} is the strongest source-level place to explain what ${repoName} actually does.`,
        teachingGoal: "Open on a real source file that gives the viewer a concrete mental model immediately.",
        filePaths: relatedFiles,
        sourceRefs,
        relatedNodeIds: relatedFiles.map((filePath) => `file:${filePath}`),
        tags: ["hook", "opener"],
        importance: 100,
        visualKind: "code",
      })
    );
  }

  contextCapsules.push(
    createCapsule({
      id: "capsule-repo-map",
      purpose: "repo_map",
      phase: "architecture",
      title: "Repo Map: What Lives Where",
      summary: `${repoName} is organized into a few structural areas that can be explained from the real tree, clusters, and hub files.`,
      teachingGoal: "Give the viewer a clean map of the repo before diving into code details.",
      filePaths: uniqueStrings([
        ...evidence.entry_candidates.slice(0, 2),
        ...evidence.hub_files.slice(0, 2),
        ...codegraphModules.slice(0, 3).map((module) => module.fullPath),
        ...evidence.cluster_summaries.map((cluster) => cluster.representative_file),
      ]),
      sourceRefs: buildSceneSourceRefs(
        uniqueStrings([
          ...evidence.entry_candidates.slice(0, 2),
          ...evidence.hub_files.slice(0, 2),
          ...codegraphModules.slice(0, 3).map((module) => module.fullPath),
          ...evidence.cluster_summaries.map((cluster) => cluster.representative_file),
        ]).slice(0, 4),
        evidence,
        fileContents,
        graphData,
        "Repository map anchor"
      ),
      relatedNodeIds: uniqueStrings([
        ...evidence.cluster_summaries.map((cluster) => `cluster:${cluster.cluster_id}`),
        ...evidence.hub_files.slice(0, 3).map((filePath) => `file:${filePath}`),
      ]),
      tags: ["repo-map", "overview"],
      importance: 95,
      visualKind: "repo-map",
    })
  );

  strategicFiles
    .filter((filePath) => filePath !== opener?.file_path)
    .slice(0, 8)
    .forEach((filePath, index) => {
      const relatedFiles = uniqueStrings([
        filePath,
        ...getRelatedFilesForFile(graphData, filePath, evidence.repo_tree, 4),
      ]);
      const purpose =
        isConfigFile(filePath) || isTestFile(filePath) ? "operations" : "module";
      const phase: TutorialPhase =
        purpose === "operations" ? "details" : "deep_dive";
      const sourceRefs = buildSceneSourceRefs(
        relatedFiles.slice(0, 4),
        evidence,
        fileContents,
        graphData,
        "Module capsule"
      );
      contextCapsules.push(
        createCapsule({
          id: `capsule-module-${index + 1}-${filePath.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
          purpose,
          phase,
          title:
            purpose === "operations"
              ? `Operational Detail: ${humanizeFileLabel(filePath)}`
              : `Deep Dive: ${humanizeFileLabel(filePath)}`,
          summary: createFileSummary(filePath, evidence),
          teachingGoal:
            purpose === "operations"
              ? "Show the supporting layer that makes the codebase operable and maintainable."
              : "Explain why this file matters to the architecture and how it connects to nearby modules.",
          filePaths: relatedFiles,
          sourceRefs,
          relatedNodeIds: relatedFiles.map((candidate) => `file:${candidate}`),
          tags: uniqueStrings([...buildFileTags(filePath, evidence), purpose]),
          importance: clamp(82 - index * 3, 48, 82),
          visualKind: "code",
        })
      );
    });

  const readingPaths = buildReadingPaths(repoName, evidence, strategicFiles);
  const primaryReadingPath = readingPaths[0];
  if (primaryReadingPath) {
    contextCapsules.push(
      createCapsule({
        id: "capsule-conclusion",
        purpose: "conclusion",
        phase: "conclusion",
        title: "Where To Read Next",
        summary: `${repoName} should end with a concrete reading path, not a vague summary.`,
        teachingGoal: "Leave the viewer with an exact next-file sequence for onboarding.",
        filePaths: primaryReadingPath.file_paths,
        sourceRefs: buildSceneSourceRefs(
          primaryReadingPath.file_paths.slice(0, 4),
          evidence,
          fileContents,
          graphData,
          "Reading path"
        ),
        relatedNodeIds: primaryReadingPath.node_ids,
        tags: ["conclusion", "reading-path"],
        importance: 18,
        visualKind: "repo-map",
      })
    );
  }

  readingPaths.forEach((path, index) => {
    path.node_ids.forEach((nodeId, stepIndex) => {
      if (stepIndex === path.node_ids.length - 1) return;
      addEdge(edges, {
        source: nodeId,
        target: path.node_ids[stepIndex + 1],
        type: "READ_NEXT",
        weight: clamp(1 - stepIndex * 0.1, 0.4, 1),
        rationale: `${path.title} reading order`,
      });
    });

  codegraphEntities
    .filter((entity) => strategicFiles.includes(entity.modulePath))
    .slice(0, 16)
    .forEach((entity, index) => {
      const symbolId = `symbol:codegraph:${entity.modulePath}:${entity.name}`;
      const ref: SourceRef = {
        file_path: entity.modulePath,
        start_line: entity.startLine || 1,
        end_line: entity.endLine || Math.max((entity.startLine || 1) + 8, 1),
        symbol_name: entity.name,
        reason: `${entity.entityType} dependency anchor`,
      };
      addNode(nodes, {
        id: symbolId,
        kind: "symbol",
        label: entity.name,
        summary: `${entity.name} is a ${entity.entityType} with ${entity.linksIn + entity.linksOut} dependency touches in ${humanizeFileLabel(entity.modulePath)}.`,
        file_path: entity.modulePath,
        symbol_name: entity.name,
        score: clamp(entity.linksIn * 6 + entity.linksOut * 5 + 24 - index, 32, 90),
        tags: uniqueStrings([entity.entityType.toLowerCase(), "symbol", "codegraph"]),
        source_refs: [ref],
      });
      addEdge(edges, {
        source: `file:${entity.modulePath}`,
        target: symbolId,
        type: "HIGHLIGHTS_SYMBOL",
        weight: clamp((entity.linksIn + entity.linksOut + 8) / 24, 0.4, 0.95),
      });
    });
    if (path.node_ids[0]) {
      addEdge(edges, {
        source: "repo:root",
        target: path.node_ids[0],
        type: "RELATES_TO",
        weight: clamp(0.9 - index * 0.1, 0.5, 0.9),
        rationale: path.description,
      });
    }
  });

  contextCapsules.forEach((capsule) => {
    capsule.related_node_ids.forEach((nodeId) => {
      if (nodes.some((node) => node.id === nodeId)) {
        addEdge(edges, {
          source: "repo:root",
          target: nodeId,
          type: "RELATES_TO",
          weight: clamp(capsule.importance / 100, 0.3, 1),
          rationale: `${capsule.title} uses this node as supporting context.`,
        });
      }
    });
  });

  const sortedCapsules = contextCapsules
    .sort((a, b) => b.importance - a.importance)
    .filter((capsule, index, list) =>
      list.findIndex((candidate) => candidate.id === capsule.id) === index
    );

  return {
    version: "v1",
    repo_name: repoName,
    generated_at: new Date().toISOString(),
    nodes,
    edges,
    context_capsules: sortedCapsules,
    reading_paths: readingPaths,
    summary: {
      architecture: evidence.repo_stats?.architecture_pattern,
      technologies: evidence.repo_stats?.key_technologies || [],
      entry_files: evidence.entry_candidates.slice(0, 5),
      hub_files: evidence.hub_files.slice(0, 6),
      top_clusters: evidence.cluster_summaries.map((cluster) => cluster.label),
      top_processes: evidence.process_flows.map((process) => process.name),
      total_nodes: nodes.length,
      total_edges: edges.length,
      total_capsules: sortedCapsules.length,
      total_reading_paths: readingPaths.length,
    },
  };
};

export const getTutorialCapsules = (
  knowledgeGraph: RepoKnowledgeGraph
) => {
  const orderedPurposes: RepoContextCapsule["purpose"][] = [
    "hook",
    "repo_map",
    "architecture",
    "flow",
    "module",
    "operations",
    "conclusion",
  ];

  return orderedPurposes.flatMap((purpose) =>
    knowledgeGraph.context_capsules
      .filter((capsule) => capsule.purpose === purpose)
      .sort((a, b) => b.importance - a.importance)
  );
};

export const getContextFilesForCapsule = (
  knowledgeGraph: RepoKnowledgeGraph,
  capsule: RepoContextCapsule,
  limit = 6
) => {
  const filePaths = uniqueStrings([
    ...capsule.file_paths,
    ...capsule.related_node_ids
      .map((nodeId) =>
        knowledgeGraph.nodes.find((node) => node.id === nodeId)?.file_path
      ),
  ]);

  return filePaths.slice(0, limit);
};

export const getContextSummaryForCapsule = (
  knowledgeGraph: RepoKnowledgeGraph,
  capsule: RepoContextCapsule
) => {
  const relatedLabels = uniqueStrings(
    capsule.related_node_ids
      .map((nodeId) => knowledgeGraph.nodes.find((node) => node.id === nodeId)?.label)
      .slice(0, 4)
  );

  if (relatedLabels.length === 0) {
    return capsule.summary;
  }

  return `${capsule.summary} Related anchors: ${relatedLabels.join(", ")}.`;
};

export const getKnowledgeNodeCountByKind = (
  knowledgeGraph: RepoKnowledgeGraph,
  kind: RepoKnowledgeNodeKind
) => knowledgeGraph.nodes.filter((node) => node.kind === kind).length;
