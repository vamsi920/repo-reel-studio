import DeepWikiService, {
  DeepWikiServiceError,
} from "#/api/deepwiki-service/deepwiki-service.api";
import type {
  DeepWikiWikiPage,
  DeepWikiWikiSection,
  DeepWikiWikiStructure,
  DeepWikiWikiTaskStatus,
} from "#/api/deepwiki-service/deepwiki-service.types";
import { extractCitedRanges } from "./citation-parser";
import type { EvidenceSubsystemEntry } from "./code-evidence";
import { resolveDeepWikiRepoTarget } from "./deepwiki-repo-target";

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

export interface GenerateOptions {
  /** Bypass any cached result for this exact commit and regenerate. */
  force?: boolean;
  /** Condensed real-code-structure evidence (subsystems, layers, import/call
   * edges) from the CodeGraph analyzer, to ground structure determination
   * beyond the file tree and README alone. Best-effort — omit if unavailable. */
  codeEvidence?: string;
  /** Full per-subsystem file lists (distinct from `codeEvidence`'s truncated
   * summary) — lets the backend match a page's own declared files against
   * real subsystems and ground per-page generation, not just the one-shot
   * structure/taxonomy decision. Best-effort — omit if unavailable. */
  codeEvidenceSubsystems?: EvidenceSubsystemEntry[];
}

export interface RepositoryKnowledgeEngine {
  generate(
    snapshot: RepositorySnapshot,
    options?: GenerateOptions,
  ): Promise<KnowledgeRepository>;
}

/** Progress callback fired as the underlying DeepWiki task advances through
 * its real status machine (pending → indexing → determining_structure →
 * generating → completed/failed). Purely informational — callers that don't
 * need progress UI can omit it. */
export type KnowledgeGenerationProgress = (
  status: DeepWikiWikiTaskStatus,
) => void;

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
/** Consecutive transport drops (with no progress in between) tolerated
 * before a generation is declared unreachable. */
const MAX_STREAM_RECONNECTS = 5;
const RECONNECT_BACKOFF_MS = 2000;
const STREAM_DISCONNECTED_MESSAGE =
  "DeepWiki stopped responding — is the DeepWiki service still running? See docs/deepwiki-video-kt-integration.md.";

type StreamOutcome =
  | { kind: "settled"; status: DeepWikiWikiTaskStatus | null }
  | { kind: "disconnected"; sawProgress: boolean };

function isTaskStatus(value: unknown): value is DeepWikiWikiTaskStatus {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { status?: unknown }).status === "string"
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

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
  const citedRanges = extractCitedRanges(page.content);
  return {
    id: page.id,
    // Real per-page rationale the model writes during structure planning —
    // falls back to the old first-line-of-content heuristic only for cached
    // wikis generated before the backend started keeping this field.
    description:
      page.description?.trim() ||
      page.content
        .split("\n")
        .find((line) => line.trim().length > 0)
        ?.trim() ||
      "",
    title: page.title,
    contentMarkdown: page.content,
    importance: coerceImportance(page.importance),
    relevantFiles: page.filePaths.map((path) => {
      const range = citedRanges.get(path);
      return range
        ? { path, startLine: range.startLine, endLine: range.endLine }
        : { path };
    }),
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
 * docs/deepwiki-video-kt-integration.md). Prefers DeepWiki's `type: "github"`
 * clone-by-URL mode (see deepwiki-repo-target.ts) so generation doesn't
 * depend on DeepWiki sharing a filesystem with the agent-server sandbox;
 * falls back to `type: "local"` (reading the exact local checkout Neo
 * already resolved for this commit) when no GitHub credential is available.
 */
export class DeepWikiKnowledgeEngine implements RepositoryKnowledgeEngine {
  constructor(
    private options: {
      provider?: string;
      model?: string;
      onProgress?: KnowledgeGenerationProgress;
    } = {},
  ) {}

  async generate(
    snapshot: RepositorySnapshot,
    options: GenerateOptions = {},
  ): Promise<KnowledgeRepository> {
    const target = await resolveDeepWikiRepoTarget(snapshot);
    const repoType = target.type;
    const submitResult = await DeepWikiService.submitWikiTask({
      repo_url: target.repo_url,
      type: repoType,
      token: target.token,
      owner: snapshot.owner,
      repo: snapshot.repo,
      provider: this.options.provider ?? "google",
      model: this.options.model,
      commit_sha: snapshot.commitSha,
      force: options.force,
      code_evidence: options.codeEvidence,
      code_evidence_subsystems: options.codeEvidenceSubsystems,
    });

    // `from_cache: true` means this exact repo/commit/provider variant was
    // already generated — DeepWiki doesn't register a live task for it, so
    // its own stream endpoint 404s immediately if we try to watch it (its
    // docstring says as much: "the frontend then falls back to the wiki
    // cache"). Read the cache directly instead of streaming in that case.
    let taskGone = false;
    if (!submitResult.from_cache) {
      const finalStatus = await this.waitForCompletion(submitResult.task_id);
      taskGone = finalStatus === null;
      // `null` means the task had already left DeepWiki's registry by the
      // time we could ask about it (terminal tasks only linger for a TTL) —
      // the wiki cache below is the only remaining source of truth, so let
      // it decide rather than failing a generation that may well have
      // finished while we were disconnected.
      if (finalStatus?.status === "failed") {
        throw new Error(
          finalStatus.error ??
            `DeepWiki generation failed for ${snapshot.owner}/${snapshot.repo}`,
        );
      }
      if (finalStatus && !finalStatus.wiki_structure) {
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
      "en",
      snapshot.commitSha,
    );
    if (!cache) {
      throw new Error(
        taskGone
          ? `Lost track of DeepWiki's generation task for ${snapshot.owner}/${snapshot.repo} and no finished wiki was found — run Generate again to resume.`
          : `DeepWiki reported success for ${snapshot.owner}/${snapshot.repo} but its wiki cache was empty.`,
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

  /**
   * Resolves with the task's terminal status, or `null` once the task is no
   * longer known to DeepWiki at all (evicted after its post-completion TTL,
   * or reported as "no longer available" on the stream).
   *
   * The SSE stream is the primary signal, but a browser `EventSource` fires
   * a bare `error` on any transport drop — laptop sleep, a Wi-Fi blip, a
   * proxy cutting a long-lived connection — while DeepWiki's task keeps
   * running server-side. Treating that drop as a failed generation showed
   * the user an error for work that was still (or already) finished. On a
   * drop, ask DeepWiki directly what state the task is in and either settle
   * on that answer or re-attach to the stream; only give up after several
   * consecutive attempts fail to reach it.
   */
  private async waitForCompletion(
    taskId: string,
  ): Promise<DeepWikiWikiTaskStatus | null> {
    let attempts = 0;
    for (;;) {
      const outcome = await this.streamUntilSettled(taskId);
      if (outcome.kind !== "disconnected") return outcome.status;
      // Progress since the last drop proves DeepWiki is reachable and
      // working — a later drop is a fresh incident, not the same one.
      if (outcome.sawProgress) attempts = 0;

      // Poll the cheap status endpoint until DeepWiki answers, then either
      // settle on that answer or re-attach to the stream for the rest.
      for (;;) {
        attempts += 1;
        if (attempts > MAX_STREAM_RECONNECTS) {
          throw new Error(STREAM_DISCONNECTED_MESSAGE);
        }
        await delay(RECONNECT_BACKOFF_MS * attempts);
        let status: DeepWikiWikiTaskStatus;
        try {
          status = await DeepWikiService.getWikiTask(taskId);
        } catch (error) {
          if (error instanceof DeepWikiServiceError && error.status === 404) {
            return null;
          }
          continue;
        }
        this.options.onProgress?.(status);
        if (status.status === "completed" || status.status === "failed") {
          return status;
        }
        break;
      }
    }
  }

  private streamUntilSettled(taskId: string): Promise<StreamOutcome> {
    return new Promise((resolve) => {
      let sawProgress = false;
      // Belt-and-suspenders: if the SSE connection never opens at all (e.g.
      // DeepWiki isn't running) or goes silent mid-generation, surface a
      // clear error instead of hanging forever. This resets on every real
      // progress event rather than firing from a fixed clock — a large repo
      // (thousands of indexed chunks, many wiki pages each costing their own
      // LLM call) can legitimately take well past any fixed cap as long as
      // it's still making progress; what actually indicates a hang is no
      // progress for a while, not elapsed wall-clock time.
      let inactivityTimer: number;
      const armInactivityTimer = () => {
        window.clearTimeout(inactivityTimer);
        inactivityTimer = window.setTimeout(() => {
          unsubscribe();
          resolve({ kind: "disconnected", sawProgress });
        }, INACTIVITY_TIMEOUT_MS);
      };

      const unsubscribe = DeepWikiService.streamWikiTask(taskId, {
        onProgress: (status) => {
          sawProgress = true;
          armInactivityTimer();
          this.options.onProgress?.(status);
        },
        onDone: (status) => {
          window.clearTimeout(inactivityTimer);
          this.options.onProgress?.(status);
          resolve({ kind: "settled", status });
        },
        onError: (statusOrError) => {
          window.clearTimeout(inactivityTimer);
          if (statusOrError instanceof Error) {
            resolve({ kind: "disconnected", sawProgress });
            return;
          }
          // The stream's `error` event carries either a full failed-task
          // status or a bare `{"error": "task no longer available"}` when
          // the registry dropped the task mid-stream — the latter has no
          // `status` and must not be mistaken for a terminal task status.
          if (!isTaskStatus(statusOrError)) {
            resolve({ kind: "settled", status: null });
            return;
          }
          this.options.onProgress?.(statusOrError);
          resolve({ kind: "settled", status: statusOrError });
        },
      });
      armInactivityTimer();
    });
  }
}
