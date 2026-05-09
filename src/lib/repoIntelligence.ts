import { buildRepoEvidenceBundle } from "@/lib/repoEvidence";
import { buildRepoKnowledgeGraph, getTutorialCapsules } from "@/lib/repoKnowledgeGraph";
import type {
  GitNexusGraphData,
  RepoEvidenceBundle,
  RepoIntelligence,
  RepoKnowledgeGraph,
  RepoModuleProfile,
} from "@/lib/types";

const WORDS_PER_SECOND = 2.3;

const estimateMinutesForModule = (
  fileCount: number,
  lineCount: number,
  complexity: "low" | "medium" | "high"
) => {
  const base = fileCount * 0.5 + lineCount * 0.002;
  const multiplier = complexity === "high" ? 1.6 : complexity === "medium" ? 1.2 : 1.0;
  return Math.max(2, Math.round(base * multiplier * 10) / 10);
};

const classifyComplexity = (
  fileCount: number,
  lineCount: number,
  isHub: boolean
): "low" | "medium" | "high" => {
  if (isHub || lineCount > 2000 || fileCount > 12) return "high";
  if (lineCount > 600 || fileCount > 5) return "medium";
  return "low";
};

const buildModulesFromClusters = (
  evidence: RepoEvidenceBundle,
  fileContents: Record<string, string>,
  graphData?: GitNexusGraphData | null
): RepoModuleProfile[] => {
  const modules: RepoModuleProfile[] = [];

  for (const cluster of evidence.cluster_summaries) {
    const filePaths = cluster.file_paths.filter((fp) => fileContents[fp]);
    if (filePaths.length === 0) continue;

    const lineCount = filePaths.reduce(
      (sum, fp) => sum + (fileContents[fp]?.split("\n").length ?? 0),
      0
    );
    const isHub = filePaths.some((fp) => evidence.hub_files.includes(fp));
    const isEntry = filePaths.some((fp) => evidence.entry_candidates.includes(fp));

    const techs = new Set<string>();
    for (const fp of filePaths) {
      const ext = fp.split(".").pop()?.toLowerCase();
      if (ext === "ts" || ext === "tsx") techs.add("TypeScript");
      else if (ext === "js" || ext === "jsx") techs.add("JavaScript");
      else if (ext === "py") techs.add("Python");
      else if (ext === "go") techs.add("Go");
      else if (ext === "rs") techs.add("Rust");
      else if (ext === "java" || ext === "kt") techs.add("JVM");
    }

    modules.push({
      id: cluster.cluster_id,
      label: cluster.label,
      description: cluster.description || `${cluster.label} module with ${filePaths.length} files.`,
      file_paths: filePaths,
      representative_file: cluster.representative_file || filePaths[0],
      technologies: Array.from(techs),
      complexity: classifyComplexity(filePaths.length, lineCount, isHub),
      is_entry: isEntry,
      is_hub: isHub,
    });
  }

  return modules;
};

const buildCandidateTutorials = (
  modules: RepoModuleProfile[],
  repoName: string
): RepoIntelligence["candidate_tutorials"] => {
  const tutorials: RepoIntelligence["candidate_tutorials"] = [];

  tutorials.push({
    id: "tutorial-master",
    title: `${repoName} — Full Architecture Walkthrough`,
    description: "End-to-end narrative covering every module from entry point to infrastructure.",
    module_ids: modules.map((m) => m.id),
    estimated_minutes: modules.reduce(
      (sum, m) =>
        sum + estimateMinutesForModule(m.file_paths.length, m.file_paths.length * 80, m.complexity),
      0
    ),
  });

  const entryModules = modules.filter((m) => m.is_entry);
  if (entryModules.length > 0) {
    tutorials.push({
      id: "tutorial-quickstart",
      title: "Quick Start — Entry Points & Core Flow",
      description: "Fast onboarding focused on entry files and the primary request path.",
      module_ids: entryModules.map((m) => m.id),
      estimated_minutes: entryModules.reduce(
        (sum, m) =>
          sum + estimateMinutesForModule(m.file_paths.length, m.file_paths.length * 80, m.complexity),
        0
      ),
    });
  }

  const hubModules = modules.filter((m) => m.is_hub && !m.is_entry);
  if (hubModules.length > 0) {
    tutorials.push({
      id: "tutorial-deep-dive",
      title: "Deep Dive — Core Modules & Business Logic",
      description: "In-depth exploration of the hub modules that house the main logic.",
      module_ids: hubModules.map((m) => m.id),
      estimated_minutes: hubModules.reduce(
        (sum, m) =>
          sum + estimateMinutesForModule(m.file_paths.length, m.file_paths.length * 80, m.complexity),
        0
      ),
    });
  }

  return tutorials;
};

export interface RepoIntelligenceResult {
  intelligence: RepoIntelligence;
  evidence: RepoEvidenceBundle;
  knowledgeGraph: RepoKnowledgeGraph;
}

export const buildRepoIntelligence = (
  repoName: string,
  repoUrl: string,
  fileContents: Record<string, string>,
  graphData?: GitNexusGraphData | null
): RepoIntelligenceResult => {
  const evidence = buildRepoEvidenceBundle(repoName, fileContents, graphData);
  const knowledgeGraph = buildRepoKnowledgeGraph(repoName, evidence, fileContents, graphData);

  const modules = buildModulesFromClusters(evidence, fileContents, graphData);
  const candidateTutorials = buildCandidateTutorials(modules, repoName);
  const capsules = getTutorialCapsules(knowledgeGraph);

  const intelligence: RepoIntelligence = {
    repo_name: repoName,
    repo_url: repoUrl,
    generated_at: new Date().toISOString(),
    architecture_pattern: evidence.repo_stats?.architecture_pattern,
    technologies: evidence.repo_stats?.key_technologies ?? [],
    entry_files: evidence.entry_candidates,
    hub_files: evidence.hub_files,
    total_files: evidence.repo_stats?.total_files ?? 0,
    total_source_files: evidence.repo_stats?.total_source_files ?? 0,
    total_lines: evidence.repo_stats?.total_lines ?? 0,
    languages: evidence.repo_stats?.languages ?? {},
    modules,
    candidate_tutorials: candidateTutorials,
    evidence_health: {
      snippet_count: evidence.snippet_catalog.length,
      important_file_count: evidence.important_files.length,
      cluster_count: evidence.cluster_summaries.length,
      process_flow_count: evidence.process_flows.length,
      fact_count: evidence.repo_facts.length,
      reading_path_count: knowledgeGraph.reading_paths.length,
    },
    knowledge_graph_summary: knowledgeGraph.summary,
  };

  return { intelligence, evidence, knowledgeGraph };
};
