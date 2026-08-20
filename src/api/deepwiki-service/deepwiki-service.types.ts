/**
 * Wire types for the vendored DeepWiki-Open backend (`vendor/deepwiki-open/api/`),
 * mirrored from its real Pydantic models (`api/schemas/repo.py`,
 * `api/schemas/wiki.py` at upstream commit
 * c6bea82b68d47fd81f514e96025de90698030708 — see THIRD_PARTY_NOTICES.md).
 * These are DeepWiki's own shapes, not NeoDevEx's normalized types — see
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
