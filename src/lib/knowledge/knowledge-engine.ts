import DeepWikiService from "#/api/deepwiki-service/deepwiki-service.api";
import type {
  DeepWikiWikiPage,
  DeepWikiWikiSection,
  DeepWikiWikiStructure,
  DeepWikiWikiTaskStatus,
} from "#/api/deepwiki-service/deepwiki-service.types";

/** Every generation must resolve to an immutable commit. */
export interface RepositorySnapshot {
  repositoryId: string;
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  /** Absolute path to a local checkout of this exact commit, shared with the
   * DeepWiki process (e.g. an agent-server sandbox's working_dir). */
  localPath: string;
}

export interface RelevantFile {
  path: string;
  startLine?: number;
  endLine?: number;
  symbol?: string;
}

export interface KnowledgeDiagram {
  id: string;
  type: "architecture" | "dependency" | "flow" | "sequence" | "other";
  mermaid: string;
}

export type KnowledgeImportance = "high" | "medium" | "low";

export interface KnowledgePage {
  id: string;
  title: string;
  description: string;
  contentMarkdown: string;
  importance: KnowledgeImportance;
  relevantFiles: RelevantFile[];
  diagrams: KnowledgeDiagram[];
  relatedPageIds: string[];
  parentSectionId?: string;
}

export interface KnowledgeSection {
  id: string;
  title: string;
  description?: string;
  pageIds: string[];
}

export interface KnowledgeRepository {
  repositoryId: string;
  commitSha: string;
  title: string;
  summary: string;
  sections: KnowledgeSection[];
  pages: KnowledgePage[];
  generatedAt: string;
}

export interface RepositoryKnowledgeEngine {
  generate(snapshot: RepositorySnapshot): Promise<KnowledgeRepository>;
}

/** Progress callback fired as the underlying DeepWiki task advances through
 * its real status machine (pending → indexing → determining_structure →
 * generating → completed/failed). Purely informational — callers that don't
 * need progress UI can omit it. */
export type KnowledgeGenerationProgress = (
  status: DeepWikiWikiTaskStatus,
) => void;

const MERMAID_FENCE_RE = /```mermaid\n([\s\S]*?)```/g;

/** Classifies a Mermaid block's diagram type from its own syntax — DeepWiki
 * doesn't tag diagram type separately, so this is a cheap heuristic over the
 * real diagram source, never a re-generation of it. */
function classifyMermaidType(mermaid: string): KnowledgeDiagram["type"] {
  const head = mermaid.trim().split("\n")[0]?.toLowerCase() ?? "";
  if (head.startsWith("sequencediagram")) return "sequence";
  if (head.startsWith("classdiagram") || head.startsWith("erdiagram")) {
    return "dependency";
  }
  if (/flowchart|graph\s/.test(head)) {
    return /architecture|component|module|service/i.test(mermaid)
      ? "architecture"
      : "flow";
  }
  return "other";
}

/** Pulls every ```mermaid fenced block out of a DeepWiki page's markdown —
 * the diagram source is used exactly as DeepWiki generated it, never
 * re-asked of an LLM. */
function extractDiagrams(
  pageId: string,
  contentMarkdown: string,
): KnowledgeDiagram[] {
  const diagrams: KnowledgeDiagram[] = [];
  let match: RegExpExecArray | null;
  let index = 0;
  MERMAID_FENCE_RE.lastIndex = 0;
  while ((match = MERMAID_FENCE_RE.exec(contentMarkdown)) !== null) {
    const mermaid = match[1].trim();
    if (!mermaid) continue;
    diagrams.push({
      id: `${pageId}-diagram-${index}`,
      type: classifyMermaidType(mermaid),
      mermaid,
    });
    index += 1;
  }
  return diagrams;
}

/** DeepWiki types `importance` as a loose `str` ("Should ideally be
 * Literal['high','medium','low']" per its own source comment) — coerce it
 * defensively rather than trusting it's always one of the three values. */
function coerceImportance(value: string): KnowledgeImportance {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "high" ||
    normalized === "medium" ||
    normalized === "low"
  ) {
    return normalized;
  }
  return "medium";
}

function normalizePage(page: DeepWikiWikiPage): KnowledgePage {
  return {
    id: page.id,
    title: page.title,
    description:
      page.content
        .split("\n")
        .find((line) => line.trim().length > 0)
        ?.trim() ?? "",
    contentMarkdown: page.content,
    importance: coerceImportance(page.importance),
    relevantFiles: page.filePaths.map((path) => ({ path })),
    diagrams: extractDiagrams(page.id, page.content),
    relatedPageIds: page.relatedPages,
  };
}

function normalizeSection(
  section: DeepWikiWikiSection,
  pagesById: Map<string, KnowledgePage>,
): KnowledgeSection {
  for (const pageId of section.pages) {
    const page = pagesById.get(pageId);
    if (page) page.parentSectionId = section.id;
  }
  return {
    id: section.id,
    title: section.title,
    pageIds: section.pages,
  };
}

function normalizeStructure(
  structure: DeepWikiWikiStructure,
  snapshot: RepositorySnapshot,
): KnowledgeRepository {
  const pages = structure.pages.map(normalizePage);
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const sections = (structure.sections ?? []).map((section) =>
    normalizeSection(section, pagesById),
  );

  return {
    repositoryId: snapshot.repositoryId,
    commitSha: snapshot.commitSha,
    title: structure.title,
    summary: structure.description,
    sections,
    pages,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Reuses DeepWiki-Open's own async task machine as the job queue — this app
 * has no job-queue infrastructure of its own to build one in (see
 * docs/deepwiki-video-kt-integration.md). DeepWiki's `type: "local"` repo
 * mode means no second GitHub auth or clone step is introduced either: it
 * reads the exact local checkout NeoDevEx already resolved for this commit.
 */
export class DeepWikiKnowledgeEngine implements RepositoryKnowledgeEngine {
  constructor(
    private options: {
      provider?: string;
      model?: string;
      onProgress?: KnowledgeGenerationProgress;
    } = {},
  ) {}

  async generate(snapshot: RepositorySnapshot): Promise<KnowledgeRepository> {
    const repoType = "local";
    const submitResult = await DeepWikiService.submitWikiTask({
      repo_url: snapshot.localPath,
      type: repoType,
      owner: snapshot.owner,
      repo: snapshot.repo,
      provider: this.options.provider ?? "google",
      model: this.options.model,
    });

    // `from_cache: true` means this exact repo/commit/provider variant was
    // already generated — DeepWiki doesn't register a live task for it, so
    // its own stream endpoint 404s immediately if we try to watch it (its
    // docstring says as much: "the frontend then falls back to the wiki
    // cache"). Read the cache directly instead of streaming in that case.
    if (!submitResult.from_cache) {
      const finalStatus = await this.waitForCompletion(submitResult.task_id);
      if (finalStatus.status === "failed") {
        throw new Error(
          finalStatus.error ??
            `DeepWiki generation failed for ${snapshot.owner}/${snapshot.repo}`,
        );
      }
      if (!finalStatus.wiki_structure) {
        throw new Error(
          `DeepWiki reported "${finalStatus.status}" with no wiki structure for ${snapshot.owner}/${snapshot.repo}`,
        );
      }
    }

    // DeepWiki's task/stream status only ever carries page metadata
    // (title/filePaths/importance) with `content` left empty — the real
    // generated markdown lives separately in its wiki-cache store
    // (`generated_pages`, keyed by page id), written once the task
    // completes. Read the cache directly for the final result either way,
    // so a cache-hit run and a freshly-completed run both go through the
    // same path instead of merging two different response shapes.
    const cache = await DeepWikiService.getWikiCache(
      snapshot.owner,
      snapshot.repo,
      repoType,
    );
    if (!cache) {
      throw new Error(
        `DeepWiki reported success for ${snapshot.owner}/${snapshot.repo} but its wiki cache was empty.`,
      );
    }
    const hydratedStructure: DeepWikiWikiStructure = {
      ...cache.wiki_structure,
      pages: cache.wiki_structure.pages.map(
        (page) => cache.generated_pages[page.id] ?? page,
      ),
    };

    return normalizeStructure(hydratedStructure, snapshot);
  }

  private waitForCompletion(taskId: string): Promise<DeepWikiWikiTaskStatus> {
    return new Promise((resolve, reject) => {
      // Belt-and-suspenders: if the SSE connection never opens at all (e.g.
      // DeepWiki isn't running) or goes silent mid-generation, surface a
      // clear error instead of hanging forever. This resets on every real
      // progress event rather than firing from a fixed clock — a large repo
      // (thousands of indexed chunks, many wiki pages each costing their own
      // LLM call) can legitimately take well past any fixed cap as long as
      // it's still making progress; what actually indicates a hang is no
      // progress for a while, not elapsed wall-clock time.
      let inactivityTimer: number;
      const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
      const armInactivityTimer = () => {
        window.clearTimeout(inactivityTimer);
        inactivityTimer = window.setTimeout(() => {
          unsubscribe();
          reject(
            new Error(
              "DeepWiki stopped responding — is the DeepWiki service still running? See docs/deepwiki-video-kt-integration.md.",
            ),
          );
        }, INACTIVITY_TIMEOUT_MS);
      };

      const unsubscribe = DeepWikiService.streamWikiTask(taskId, {
        onProgress: (status) => {
          armInactivityTimer();
          this.options.onProgress?.(status);
        },
        onDone: (status) => {
          window.clearTimeout(inactivityTimer);
          this.options.onProgress?.(status);
          resolve(status);
        },
        onError: (statusOrError) => {
          window.clearTimeout(inactivityTimer);
          if (statusOrError instanceof Error) {
            reject(statusOrError);
            return;
          }
          this.options.onProgress?.(statusOrError);
          resolve(statusOrError);
        },
      });
      armInactivityTimer();
    });
  }
}
