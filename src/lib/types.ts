export type VideoSceneType =
  | "intro"
  | "overview"
  | "entry"
  | "feature"
  | "code"
  | "summary"
  | "outro"
  | "core"
  | "support"
  | "wrap_up";

export type TutorialPhase =
  | "hook"
  | "architecture"
  | "flow"
  | "deep_dive"
  | "details"
  | "conclusion";

export type VideoVisualKind =
  | "code"
  | "overview"
  | "diagram"
  | "repo-map"
  | "comparison";

export interface SourceRef {
  file_path: string;
  start_line: number;
  end_line: number;
  symbol_name?: string;
  reason?: string;
  excerpt?: string;
}

export interface SentenceEvidence {
  sentence: string;
  claim?: string;
  source_refs: SourceRef[];
  visual_kind?: VideoVisualKind;
  on_screen_focus?: string[];
  startFrame?: number;
  endFrame?: number;
}

export interface SceneQualityFlags {
  has_real_code?: boolean;
  has_source_refs?: boolean;
  has_sentence_evidence?: boolean;
  visual_sync_ready?: boolean;
  placeholder_visual?: boolean;
  opener_eligible?: boolean;
  repo_noise?: boolean;
  generic_language_count?: number;
}

export interface VideoSceneDiagram {
  mermaid: string;
  caption?: string;
  kind?: "architecture" | "flow" | "dependency";
}

export interface RepoSnippet {
  id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  code: string;
  score?: number;
  role?: string;
  symbol_name?: string;
}

export interface RepoFact {
  label: string;
  value: string;
  source_refs: SourceRef[];
}

export interface RepoClusterSummary {
  cluster_id: string;
  label: string;
  description?: string;
  representative_file?: string;
  file_paths: string[];
  member_count: number;
  mermaid?: string;
}

export interface RepoProcessFlow {
  id: string;
  name: string;
  description?: string;
  steps: Array<{
    symbol_name: string;
    file_path: string;
    step_index: number;
    code_snippet?: string;
  }>;
  mermaid?: string;
}

export interface RepoEvidenceBundle {
  repo_tree: string[];
  source_files: string[];
  entry_candidates: string[];
  hub_files: string[];
  important_files: string[];
  opener_candidates: Array<{
    file_path: string;
    score: number;
    reasons: string[];
  }>;
  cluster_summaries: RepoClusterSummary[];
  process_flows: RepoProcessFlow[];
  snippet_catalog: RepoSnippet[];
  repo_facts: RepoFact[];
  repo_stats?: {
    total_files: number;
    total_source_files: number;
    total_lines: number;
    languages?: Record<string, number>;
    architecture_pattern?: string;
    key_technologies?: string[];
  };
}

export type RepoKnowledgeNodeKind =
  | "repo"
  | "architecture"
  | "technology"
  | "cluster"
  | "process"
  | "file"
  | "symbol"
  | "fact"
  | "snippet";

export type RepoKnowledgeEdgeType =
  | "HAS_ARCHITECTURE"
  | "USES_TECHNOLOGY"
  | "HAS_CLUSTER"
  | "HAS_PROCESS"
  | "HAS_FACT"
  | "HIGHLIGHTS_FILE"
  | "HIGHLIGHTS_SYMBOL"
  | "HAS_SNIPPET"
  | "RELATES_TO"
  | "READ_NEXT"
  | "SUPPORTS";

export type RepoKnowledgeCapsulePurpose =
  | "hook"
  | "repo_map"
  | "architecture"
  | "flow"
  | "module"
  | "operations"
  | "conclusion";

export interface RepoKnowledgeNode {
  id: string;
  kind: RepoKnowledgeNodeKind;
  label: string;
  summary?: string;
  file_path?: string;
  symbol_name?: string;
  score?: number;
  tags?: string[];
  source_refs?: SourceRef[];
}

export interface RepoKnowledgeEdge {
  source: string;
  target: string;
  type: RepoKnowledgeEdgeType;
  weight?: number;
  rationale?: string;
}

export interface RepoReadingPath {
  id: string;
  title: string;
  description: string;
  goal?: string;
  file_paths: string[];
  node_ids: string[];
}

export interface RepoContextCapsule {
  id: string;
  purpose: RepoKnowledgeCapsulePurpose;
  phase: TutorialPhase;
  title: string;
  summary: string;
  teaching_goal: string;
  file_paths: string[];
  source_refs: SourceRef[];
  related_node_ids: string[];
  tags: string[];
  importance: number;
  visual_kind?: VideoVisualKind;
  cluster_id?: string;
  process_id?: string;
}

export interface RepoKnowledgeSummary {
  architecture?: string;
  technologies: string[];
  entry_files: string[];
  hub_files: string[];
  top_clusters: string[];
  top_processes: string[];
  total_nodes: number;
  total_edges: number;
  total_capsules: number;
  total_reading_paths: number;
}

export interface RepoKnowledgeGraph {
  version: string;
  repo_name: string;
  generated_at: string;
  nodes: RepoKnowledgeNode[];
  edges: RepoKnowledgeEdge[];
  context_capsules: RepoContextCapsule[];
  reading_paths: RepoReadingPath[];
  summary: RepoKnowledgeSummary;
}

export interface QualityScores {
  opener_quality: number;
  evidence_coverage: number;
  generic_language_count: number;
  visual_sync: number;
  repo_noise: number;
  layman_readability: number;
}

export interface QualitySceneReport {
  scene_id: number;
  title: string;
  blockers: string[];
  warnings: string[];
  evidence_coverage: number;
  visual_sync: number;
}

export interface QualityReport {
  pipeline_version: string;
  ready_for_tts: boolean;
  blockers: string[];
  warnings: string[];
  scores: QualityScores;
  scene_reports: QualitySceneReport[];
}

// Video Manifest Types
export interface VideoScene {
  id: number;
  type: VideoSceneType;
  file_path: string;
  highlight_lines?: [number, number];
  narration_text: string;
  duration_seconds: number;
  title: string;
  code?: string;
  phase?: TutorialPhase;
  visual_type?: VideoVisualKind;
  visual_kind?: VideoVisualKind;
  bullet_points?: string[];
  focus_symbols?: string[];
  diagram?: VideoSceneDiagram;
  source_refs?: SourceRef[];
  claim?: string;
  on_screen_focus?: string[];
  sentence_evidence?: SentenceEvidence[];
  quality_flags?: SceneQualityFlags;
  repo_map_paths?: string[];
  comparison_notes?: string[];
  /** Persisted URL for TTS audio (Supabase Storage). Set when audio is uploaded. */
  audioUrl?: string;
  // Hydrated properties (added by useHydrateManifest)
  startFrame?: number;
  endFrame?: number;
}

export interface VideoManifest {
  title: string;
  scenes: VideoScene[];
  repo_files?: string[];
  pipeline_version?: string;
  evidence_bundle?: RepoEvidenceBundle;
  knowledge_graph?: RepoKnowledgeGraph;
  quality_report?: QualityReport;
  rollout_comparison?: {
    legacy_manifest?: VideoManifest | null;
    legacy_quality_report?: QualityReport | null;
    candidate_manifest?: VideoManifest | null;
    candidate_quality_report?: QualityReport | null;
    notes?: string[];
  };
  // Hydrated properties
  totalFrames?: number;
  fps?: number;
}

// User Profile Types
export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

// Auth Types
export interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// ---------------------------------------------------------------------------
// Code Graph RAG — Enhanced Graph Schema
// ---------------------------------------------------------------------------

export interface GitNexusNode {
  id: string;
  name: string;
  kind: "File" | "Function" | "Class" | "Method" | "Interface" | "Module" | "Component" | "Hook" | "Enum" | "Variable";
  filePath: string;
  startLine?: number;
  endLine?: number;
  cluster?: string;
  // Enhanced fields from Code Graph RAG
  lineCount?: number;
  docstring?: string;
  codeSnippet?: string;
  complexity?: number;
  exportType?: "default" | "named" | "none";
  language?: string;
  isEntryPoint?: boolean;
  isTestFile?: boolean;
  tags?: string[];
}

export interface GitNexusEdge {
  source: string;
  target: string;
  type: "IMPORTS" | "CALLS" | "EXTENDS" | "IMPLEMENTS" | "MEMBER_OF" | "DEFINED_IN" | "EXPORTS" | "USES_TYPE" | "TESTS";
  confidence?: number;
  label?: string;
}

export interface GitNexusCluster {
  id: string;
  label: string;
  members: string[];  // node IDs
  cohesion?: number;
  // Enhanced fields
  kind?: string;
  description?: string;
  fileCount?: number;
  totalLines?: number;
}

export interface GitNexusProcess {
  id?: string;
  name: string;
  description?: string;
  steps: { symbolName: string; filePath: string; stepIndex: number; codeSnippet?: string }[];
}

export interface GitNexusGraphSummary {
  repoName: string;
  totalFiles: number;
  totalSymbols: number;
  totalEdges: number;
  languages: Record<string, number>;
  entryPoints: string[];
  hubFiles: string[];
  architecturePattern?: string;
  keyTechnologies?: string[];
  readmeSummary?: string;
}

export interface CodegraphRawNode {
  id: string;
  label?: string;
  type: "module" | "entity" | "external";
  parent?: string;
  fullPath?: string;
  lines?: number;
  entityType?: string;
  startLine?: number;
  endLine?: number;
  weight?: number;
}

export interface CodegraphRawLink {
  source: string;
  target: string;
  type: "module-entity" | "dependency" | "module-module";
  weight?: number;
}

export interface CodegraphCsvRow {
  name: string;
  type: string;
  parent_module: string;
  full_path: string;
  links_out: number;
  links_in: number;
  lines: number;
}

export interface CodegraphModuleEntity {
  id: string;
  name: string;
  entityType: string;
  lines: number;
  startLine?: number;
  endLine?: number;
  linksIn: number;
  linksOut: number;
}

export interface CodegraphModuleIndexEntry {
  id: string;
  label: string;
  fullPath: string;
  entityCount: number;
  incomingLinks: number;
  outgoingLinks: number;
  lines: number;
  dependencies: string[];
  dependents: string[];
  topEntities: CodegraphModuleEntity[];
}

export interface CodegraphEntityIndexEntry extends CodegraphModuleEntity {
  modulePath: string;
}

export interface CodegraphSummary {
  mostConnectedModules: Array<{
    fullPath: string;
    incomingLinks: number;
    outgoingLinks: number;
    entityCount: number;
  }>;
  hottestEntities: Array<{
    name: string;
    modulePath: string;
    entityType: string;
    lines: number;
    linksIn: number;
    linksOut: number;
  }>;
  externalDependencies: Array<{
    name: string;
    linksIn: number;
  }>;
}

export interface CodegraphArtifacts {
  storagePrefix?: string;
  jsonObjectKey?: string;
  csvObjectKey?: string;
  uploadedAt?: string;
}

export interface CodegraphEngineData {
  engine: "xnuinside-codegraph";
  source?: "upstream" | "gitnexus-fallback";
  generatedAt: string;
  graph: {
    nodes: CodegraphRawNode[];
    links: CodegraphRawLink[];
    unlinkedModules: Array<{
      id: string;
      fullPath: string;
    }>;
  };
  moduleIndex: CodegraphModuleIndexEntry[];
  entityIndex: CodegraphEntityIndexEntry[];
  csvRows: CodegraphCsvRow[];
  stats: {
    pythonFileCount: number;
    moduleCount: number;
    entityCount: number;
    externalCount: number;
    linkCount: number;
    unlinkedModuleCount: number;
    stagedPythonFiles?: number;
  };
  summary: CodegraphSummary;
  artifacts?: CodegraphArtifacts;
}

export interface GitNexusGraphData {
  nodes: GitNexusNode[];
  edges: GitNexusEdge[];
  clusters: GitNexusCluster[];
  processes: GitNexusProcess[];
  summary?: GitNexusGraphSummary;
  codegraph?: CodegraphEngineData;
}
