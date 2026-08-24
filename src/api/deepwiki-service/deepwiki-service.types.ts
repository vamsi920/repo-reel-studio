/**
 * Wire types for the vendored DeepWiki-Open backend (`vendor/deepwiki-open/api/`),
 * mirrored from its real Pydantic models (`api/schemas/repo.py`,
 * `api/schemas/wiki.py` at upstream commit
 * c6bea82b68d47fd81f514e96025de90698030708 — see THIRD_PARTY_NOTICES.md).
 * These are DeepWiki's own shapes, not Neo's normalized types — see
 * `#/lib/knowledge/knowledge-engine.ts` for the adapter that converts these
 * into `KnowledgeRepository`/`KnowledgePage`.
 */

export type DeepWikiRepoType = "local" | "github" | "gitlab" | "bitbucket";

export interface DeepWikiWikiTaskRequest {
  /** URL for github/gitlab/bitbucket, or an absolute local path when type is "local". */
  repo_url: string;
  type: DeepWikiRepoType;
  owner: string;
  repo: string;
  token?: string | null;
  provider?: string;
  model?: string | null;
  language?: string;
  excluded_dirs?: string[];
  excluded_files?: string[];
  included_dirs?: string[];
  included_files?: string[];
  comprehensive?: boolean;
  /** Immutable commit SHA this generation is scoped to — without it, cache
   * keys collapse across commits and a later commit can silently serve a
   * stale cached wiki. */
  commit_sha?: string;
  /** Bypass any existing cache/active task for this exact key. */
  force?: boolean;
  /** Condensed real-code-structure evidence from Neo's CodeGraph
   * analyzer, used to ground structure determination beyond file_tree/readme. */
  code_evidence?: string | null;
  /** Full per-subsystem file lists from the same analyzer pass, used to
   * ground individual page generation (not just the one-shot structure
   * decision `code_evidence` feeds). */
  code_evidence_subsystems?:
    | { name: string; layerId?: string; filePaths: string[] }[]
    | null;
}

export interface DeepWikiChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Request body for POST /chat/completions/stream — reused (not the wiki-
 * generation path) for one-off, already-indexed-repo LLM calls like Video
 * KT's narrative pass and a Mermaid-syntax repair retry. Requires the repo
 * to already be indexed (real for any repo Knowledge has been generated
 * for), or the backend responds 425. */
export interface DeepWikiChatCompletionRequest {
  repo_url: string;
  type: DeepWikiRepoType;
  provider?: string;
  model?: string | null;
  language?: string;
  messages: DeepWikiChatMessage[];
}

export type DeepWikiTaskStatus =
  | "pending"
  | "indexing"
  | "determining_structure"
  | "generating"
  | "completed"
  | "failed";

export interface DeepWikiWikiTaskSubmitResult {
  task_id: string;
  status: DeepWikiTaskStatus;
  created: boolean;
  joined: boolean;
  from_cache: boolean;
}

export interface DeepWikiWikiPage {
  id: string;
  title: string;
  content: string;
  filePaths: string[];
  /** DeepWiki types this as a loose `str`, not a real enum — coerce on read. */
  importance: string;
  relatedPages: string[];
  /** The model's own rationale for this page, written during structure
   * planning. Optional — absent on cached wikis generated before the
   * backend started keeping this field. */
  description?: string;
}

export interface DeepWikiWikiSection {
  id: string;
  title: string;
  pages: string[];
  subsections?: string[] | null;
}

export interface DeepWikiWikiStructure {
  id: string;
  title: string;
  description: string;
  pages: DeepWikiWikiPage[];
  sections?: DeepWikiWikiSection[] | null;
  rootSections?: string[] | null;
}

export interface DeepWikiWikiTaskSummary {
  id: string;
  owner: string;
  repo: string;
  repo_type: string;
  language: string;
  status: DeepWikiTaskStatus;
  pages_done: number;
  pages_total: number;
  current_page_ids: string[];
  error: string | null;
  submitted_at: number;
  name: string;
}

export interface DeepWikiWikiTaskStatus extends DeepWikiWikiTaskSummary {
  wiki_structure: DeepWikiWikiStructure | null;
}

export interface DeepWikiWikiCacheData {
  wiki_structure: DeepWikiWikiStructure;
  generated_pages: Record<string, DeepWikiWikiPage>;
  repo_url?: string | null;
  provider?: string | null;
  model?: string | null;
}
