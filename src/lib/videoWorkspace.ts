import { humanizeFileLabel } from "@/lib/repoEvidence";
import { getCodegraphData, getCodegraphRelatedFiles, scoreCodegraphModule } from "@/lib/upstreamCodegraph";
import type {
  CodegraphModuleIndexEntry,
  GitNexusGraphData,
  RepoKnowledgeGraph,
  RepoVideoModule,
  RepoVideoModuleCatalog,
  VideoManifest,
} from "@/lib/types";

export const MASTER_VIDEO_TARGET_SECONDS_DEFAULT = 24 * 60;
export const MODULE_VIDEO_TARGET_SECONDS_DEFAULT = 8 * 60;
export const MODULE_VIDEO_TARGET_RANGE_LABEL = "7-9 min";
export const MASTER_VIDEO_TARGET_RANGE_LABEL = "20-30 min";

export interface WorkspaceVideoEntry {
  id: string;
  kind: "master" | "module";
  label: string;
  description: string;
  duration_seconds: number;
  scene_count: number;
  ready: boolean;
  module_id?: string;
}

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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "module";

const formatPathArea = (filePath: string) => {
  const normalized = (filePath || "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]} / ${parts[1]}`;
  }
  return parts[0] || "Core";
};

const buildModuleTitle = (
  clusterLabel: string | undefined,
  representativeFile: string,
  moduleEntry?: CodegraphModuleIndexEntry | null
) => {
  const cleanedCluster = (clusterLabel || "")
    .replace(/^cluster[_\s-]*/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (cleanedCluster && cleanedCluster !== "(root)") {
    const titled = cleanedCluster.replace(/\b\w/g, (char) => char.toUpperCase());
    if (!/^[A-Z0-9][A-Za-z0-9 ]+$/.test(titled) || titled.length < 3) {
      return humanizeFileLabel(representativeFile);
    }
    return titled;
  }

  if (moduleEntry?.topEntities?.[0]?.name) {
    return `${humanizeFileLabel(representativeFile)} Core`;
  }

  return humanizeFileLabel(representativeFile);
};

const buildModuleSummary = (
  title: string,
  representativeFile: string,
  moduleEntries: CodegraphModuleIndexEntry[]
) => {
  const entityCount = moduleEntries.reduce((sum, entry) => sum + entry.entityCount, 0);
  const topEntities = uniqueStrings(
    moduleEntries.flatMap((entry) => entry.topEntities.slice(0, 2).map((entity) => entity.name))
  ).slice(0, 3);

  const focusLead = topEntities.length
    ? `${title} centers on ${topEntities.join(", ")} and the code around ${humanizeFileLabel(representativeFile)}.`
    : `${title} is anchored by ${humanizeFileLabel(representativeFile)} and the surrounding implementation.`;

  return `${focusLead} This area carries ${entityCount} indexed codegraph entities across ${
    moduleEntries.length
  } important files.`;
};

const buildModuleFocus = (
  moduleEntries: CodegraphModuleIndexEntry[],
  representativeFile: string
) => {
  const primaryEntity = moduleEntries.flatMap((entry) => entry.topEntities)[0];
  if (primaryEntity?.name) {
    return `Explain how ${primaryEntity.name} turns ${humanizeFileLabel(representativeFile)} into a meaningful product capability.`;
  }
  return `Explain why ${humanizeFileLabel(representativeFile)} matters and how this part of the repo connects to the rest of the system.`;
};

const getClusterFilePaths = (
  cluster: NonNullable<GitNexusGraphData["clusters"]>[number],
  graphData?: GitNexusGraphData | null
) => {
  const nodeLookup = new Map((graphData?.nodes || []).map((node) => [node.id, node] as const));
  return uniqueStrings(
    cluster.members.map((memberId) => nodeLookup.get(memberId)?.filePath || null)
  );
};

const toModuleDuration = (
  fileCount: number,
  entityCount: number,
  dependencyCount: number
) =>
  clamp(
    MODULE_VIDEO_TARGET_SECONDS_DEFAULT + fileCount * 8 + entityCount * 2 + dependencyCount * 4,
    7 * 60,
    9 * 60
  );

const createVideoModule = ({
  id,
  title,
  representativeFile,
  clusterFiles,
  moduleEntries,
  graphData,
}: {
  id: string;
  title: string;
  representativeFile: string;
  clusterFiles: string[];
  moduleEntries: CodegraphModuleIndexEntry[];
  graphData?: GitNexusGraphData | null;
}): RepoVideoModule => {
  const relatedFiles = uniqueStrings(
    getCodegraphRelatedFiles(graphData, clusterFiles, 8)
  ).filter((filePath) => !clusterFiles.includes(filePath));
  const entityCount = moduleEntries.reduce((sum, entry) => sum + entry.entityCount, 0);
  const incomingLinks = moduleEntries.reduce((sum, entry) => sum + entry.incomingLinks, 0);
  const outgoingLinks = moduleEntries.reduce((sum, entry) => sum + entry.outgoingLinks, 0);
  const dependencyCount = uniqueStrings(
    moduleEntries.flatMap((entry) => [...entry.dependencies, ...entry.dependents])
  ).length;
  const topEntities = uniqueStrings(
    moduleEntries.flatMap((entry) => entry.topEntities.slice(0, 4).map((entity) => entity.name))
  ).slice(0, 6);
  const areaLabel = formatPathArea(representativeFile);

  return {
    id,
    title,
    summary: buildModuleSummary(title, representativeFile, moduleEntries),
    focus: buildModuleFocus(moduleEntries, representativeFile),
    representative_file: representativeFile,
    file_paths: uniqueStrings(clusterFiles).slice(0, 14),
    related_file_paths: relatedFiles.slice(0, 10),
    top_entities: topEntities,
    why_it_matters: [
      `${title} is grounded in ${areaLabel}, with ${clusterFiles.length} primary files in scope.`,
      dependencyCount > 0
        ? `This area touches ${dependencyCount} neighboring codegraph modules, so it explains important architectural seams.`
        : `This area is cohesive enough to support a focused end-to-end walkthrough.`,
      topEntities.length > 0
        ? `The strongest code anchors here are ${topEntities.slice(0, 3).join(", ")}.`
        : `The walkthrough should stay attached to the representative code instead of generic overview copy.`,
    ],
    file_count: clusterFiles.length,
    entity_count: entityCount,
    dependency_count: dependencyCount,
    incoming_links: incomingLinks,
    outgoing_links: outgoingLinks,
    estimated_duration_seconds: toModuleDuration(clusterFiles.length, entityCount, dependencyCount),
  };
};

export const discoverRepoVideoModules = (
  repoName: string,
  graphData?: GitNexusGraphData | null,
  knowledgeGraph?: RepoKnowledgeGraph | null
): RepoVideoModuleCatalog | null => {
  const codegraph = getCodegraphData(graphData);

  if (!codegraph && !knowledgeGraph?.context_capsules?.length) {
    return null;
  }

  const modulesByPath = new Map(
    (codegraph?.moduleIndex || []).map((entry) => [entry.fullPath, entry] as const)
  );
  const coveredFiles = new Set<string>();
  const discovered: RepoVideoModule[] = [];

  (graphData?.clusters || [])
    .slice()
    .sort((left, right) => {
      const leftSize = getClusterFilePaths(left, graphData).length;
      const rightSize = getClusterFilePaths(right, graphData).length;
      return rightSize - leftSize;
    })
    .forEach((cluster) => {
      const clusterFiles = getClusterFilePaths(cluster, graphData).filter((filePath) =>
        modulesByPath.has(filePath)
      );
      if (clusterFiles.length < 2) return;

      const moduleEntries = clusterFiles
        .map((filePath) => modulesByPath.get(filePath))
        .filter((entry): entry is CodegraphModuleIndexEntry => Boolean(entry))
        .sort(
          (left, right) =>
            scoreCodegraphModule(right, [], "architecture") -
            scoreCodegraphModule(left, [], "architecture")
        );

      const representative = moduleEntries[0];
      if (!representative) return;

      const title = buildModuleTitle(cluster.label, representative.fullPath, representative);
      const id = slugify(`${cluster.id}-${title}`);
      discovered.push(
        createVideoModule({
          id,
          title,
          representativeFile: representative.fullPath,
          clusterFiles,
          moduleEntries,
          graphData,
        })
      );
      clusterFiles.forEach((filePath) => coveredFiles.add(filePath));
    });

  if (discovered.length < 4 && codegraph?.moduleIndex?.length) {
    codegraph.moduleIndex
      .slice()
      .sort(
        (left, right) =>
          scoreCodegraphModule(right, [], "architecture") -
          scoreCodegraphModule(left, [], "architecture")
      )
      .forEach((moduleEntry) => {
        if (discovered.length >= 6) return;
        if (coveredFiles.has(moduleEntry.fullPath)) return;

        const clusterFiles = uniqueStrings([
          moduleEntry.fullPath,
          ...moduleEntry.dependencies.slice(0, 3),
          ...moduleEntry.dependents.slice(0, 3),
        ]).filter((filePath) => modulesByPath.has(filePath));
        if (clusterFiles.length === 0) return;

        const moduleEntries = clusterFiles
          .map((filePath) => modulesByPath.get(filePath))
          .filter((entry): entry is CodegraphModuleIndexEntry => Boolean(entry));
        const title = buildModuleTitle(undefined, moduleEntry.fullPath, moduleEntry);
        const id = slugify(`${moduleEntry.fullPath}-${title}`);

        discovered.push(
          createVideoModule({
            id,
            title,
            representativeFile: moduleEntry.fullPath,
            clusterFiles,
            moduleEntries,
            graphData,
          })
        );
        clusterFiles.forEach((filePath) => coveredFiles.add(filePath));
      });
  }

  if (discovered.length === 0 && knowledgeGraph?.context_capsules?.length) {
    knowledgeGraph.context_capsules
      .filter((capsule) => capsule.purpose === "module" || capsule.purpose === "operations")
      .slice(0, 6)
      .forEach((capsule, index) => {
        const representativeFile = capsule.file_paths[0] || "README";
        discovered.push({
          id: slugify(`${capsule.id}-${capsule.title}`),
          title: capsule.title.replace(/^Deep Dive:\s*/i, "").replace(/^Operational Detail:\s*/i, ""),
          summary: capsule.summary,
          focus: capsule.teaching_goal,
          representative_file: representativeFile,
          file_paths: capsule.file_paths.slice(0, 10),
          related_file_paths: [],
          top_entities: [],
          why_it_matters: [capsule.summary, capsule.teaching_goal],
          file_count: capsule.file_paths.length,
          entity_count: 0,
          dependency_count: 0,
          incoming_links: 0,
          outgoing_links: 0,
          estimated_duration_seconds: MODULE_VIDEO_TARGET_SECONDS_DEFAULT,
          selected_by_default: index < 3,
        });
      });
  }

  const modules = discovered
    .slice(0, 6)
    .map((module, index) => ({
      ...module,
      selected_by_default: index < 3,
    }));

  const defaultSelectedIds = modules
    .filter((module) => module.selected_by_default)
    .map((module) => module.id);
  const masterEstimatedDurationSeconds = clamp(
    MASTER_VIDEO_TARGET_SECONDS_DEFAULT + modules.length * 90,
    20 * 60,
    30 * 60
  );

  return {
    generated_at: new Date().toISOString(),
    source: "codegraph-rag",
    repo_name: repoName,
    architecture:
      graphData?.summary?.architecturePattern || knowledgeGraph?.summary?.architecture,
    modules,
    master_estimated_duration_seconds: masterEstimatedDurationSeconds,
    default_selected_ids: defaultSelectedIds,
  };
};

export const createWorkspaceManifest = (
  repoName: string,
  moduleCatalog: RepoVideoModuleCatalog,
  repoFiles: string[] = [],
  existingManifest?: VideoManifest | null
): VideoManifest => ({
  title: existingManifest?.title || `${repoName} - Video Workspace`,
  scenes: existingManifest?.scenes || [],
  repo_files: existingManifest?.repo_files || repoFiles,
  workspace_version: "v3",
  pipeline_version: existingManifest?.pipeline_version,
  evidence_bundle: existingManifest?.evidence_bundle,
  knowledge_graph: existingManifest?.knowledge_graph,
  quality_report: existingManifest?.quality_report,
  rollout_comparison: existingManifest?.rollout_comparison,
  generation_profile:
    existingManifest?.generation_profile && existingManifest.generation_profile.kind !== "workspace"
      ? existingManifest.generation_profile
      : {
          kind: "workspace",
          label: "Workspace planner",
          summary: "Codegraph-driven module discovery completed. Choose master or module videos next.",
          generated_at: new Date().toISOString(),
        },
  module_catalog: moduleCatalog,
  module_videos: existingManifest?.module_videos || [],
});

const stripWorkspaceOnlyState = (manifest: VideoManifest): VideoManifest => ({
  ...manifest,
  module_videos: undefined,
});

export const mergeGeneratedManifestIntoWorkspace = (
  repoName: string,
  existingManifest: VideoManifest | null | undefined,
  generatedManifest: VideoManifest
): VideoManifest => {
  const moduleCatalog = generatedManifest.module_catalog || existingManifest?.module_catalog;
  const moduleVideos = existingManifest?.module_videos || [];

  if (generatedManifest.generation_profile?.kind === "master") {
    return {
      ...generatedManifest,
      workspace_version: "v3",
      module_catalog: moduleCatalog,
      module_videos: moduleVideos,
    };
  }

  const moduleId = generatedManifest.generation_profile?.module_id;
  const moduleTitle =
    generatedManifest.generation_profile?.module_title || generatedManifest.title;
  const nextRecord =
    moduleId
      ? {
          module_id: moduleId,
          module_title: moduleTitle,
          generated_at: new Date().toISOString(),
          manifest: stripWorkspaceOnlyState(generatedManifest),
        }
      : null;

  const nextModuleVideos = nextRecord
    ? [
        ...moduleVideos.filter((record) => record.module_id !== nextRecord.module_id),
        nextRecord,
      ].sort((left, right) => left.module_title.localeCompare(right.module_title))
    : moduleVideos;

  return createWorkspaceManifest(
    repoName,
    moduleCatalog || {
      generated_at: new Date().toISOString(),
      source: "codegraph-rag",
      repo_name: repoName,
      modules: [],
      master_estimated_duration_seconds: MASTER_VIDEO_TARGET_SECONDS_DEFAULT,
      default_selected_ids: [],
    },
    existingManifest?.repo_files || generatedManifest.repo_files || [],
    {
      ...(existingManifest || generatedManifest),
      scenes:
        existingManifest?.generation_profile?.kind === "master"
          ? existingManifest.scenes
          : [],
      generation_profile:
        existingManifest?.generation_profile?.kind === "master"
          ? existingManifest.generation_profile
          : {
              kind: "workspace",
              label: "Workspace planner",
              summary: "Module videos are ready. Generate the master walkthrough when you want the full story.",
              generated_at: new Date().toISOString(),
            },
      module_videos: nextModuleVideos,
    }
  );
};

export const resolveWorkspaceManifest = (
  rootManifest: VideoManifest | null | undefined,
  moduleId?: string | null
) => {
  if (!rootManifest) {
    return {
      manifest: null,
      rootManifest: null,
      activeKind: "workspace" as const,
      activeLabel: "Workspace",
    };
  }

  if (moduleId) {
    const moduleRecord = rootManifest.module_videos?.find(
      (record) => record.module_id === moduleId
    );
    if (moduleRecord?.manifest) {
      return {
        manifest: moduleRecord.manifest,
        rootManifest,
        activeKind: "module" as const,
        activeLabel: moduleRecord.module_title,
      };
    }
  }

  if (rootManifest.scenes?.length > 0) {
    return {
      manifest: rootManifest,
      rootManifest,
      activeKind:
        rootManifest.generation_profile?.kind === "module" ? "module" : "master",
      activeLabel:
        rootManifest.generation_profile?.kind === "module"
          ? rootManifest.generation_profile?.module_title || rootManifest.title
          : "Master video",
    };
  }

  const fallbackModule = rootManifest.module_videos?.[0];
  if (fallbackModule?.manifest) {
    return {
      manifest: fallbackModule.manifest,
      rootManifest,
      activeKind: "module" as const,
      activeLabel: fallbackModule.module_title,
    };
  }

  return {
    manifest: null,
    rootManifest,
    activeKind: "workspace" as const,
    activeLabel: "Workspace",
  };
};

const manifestDurationSeconds = (manifest: VideoManifest | null | undefined) =>
  manifest?.scenes?.reduce(
    (sum, scene) => sum + (scene.duration_seconds || 0),
    0
  ) || 0;

export const listWorkspaceVideoEntries = (
  rootManifest: VideoManifest | null | undefined
): WorkspaceVideoEntry[] => {
  if (!rootManifest) return [];

  const entries: WorkspaceVideoEntry[] = [];
  const moduleCatalog = rootManifest.module_catalog;
  const readyModuleIds = new Set(
    (rootManifest.module_videos || []).map((record) => record.module_id)
  );

  entries.push({
    id: "master",
    kind: "master",
    label: "Master video",
    description:
      rootManifest.scenes?.length > 0
        ? "Full-repository walkthrough with the broadest narrative arc."
        : "Generate the full-repository walkthrough after reviewing discovered modules.",
    duration_seconds:
      rootManifest.scenes?.length > 0
        ? manifestDurationSeconds(rootManifest)
        : moduleCatalog?.master_estimated_duration_seconds || MASTER_VIDEO_TARGET_SECONDS_DEFAULT,
    scene_count: rootManifest.scenes?.length || 0,
    ready: (rootManifest.scenes?.length || 0) > 0,
  });

  (moduleCatalog?.modules || []).forEach((module) => {
    const record = rootManifest.module_videos?.find(
      (entry) => entry.module_id === module.id
    );
    entries.push({
      id: `module:${module.id}`,
      kind: "module",
      module_id: module.id,
      label: module.title,
      description: module.summary,
      duration_seconds: record?.manifest
        ? manifestDurationSeconds(record.manifest)
        : module.estimated_duration_seconds,
      scene_count: record?.manifest?.scenes?.length || 0,
      ready: readyModuleIds.has(module.id),
    });
  });

  return entries;
};

export const formatDurationLabel = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};
