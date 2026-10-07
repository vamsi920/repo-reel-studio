/**
 * Tells product agents that KT docs exist for the workspace they run in, at
 * conversation start (`agent_context.system_message_suffix`). The full docs
 * live as files (see `kt-workspace-export.ts`); this block is only a compact
 * map plus the instruction to read them, so it stays cheap on every launch.
 */
import { useKnowledgeStore } from "#/stores/knowledge-store";
import { normalizeWorkspacePath } from "#/lib/workspace-memory/workspace-id";
import type { KnowledgeRepository } from "./knowledge-engine";
import {
  KT_DOCS_BLOCK_END,
  KT_DOCS_BLOCK_START,
  KT_INDEX_FILE,
  ktPagePath,
  ktUsageGuidance,
  shortSha,
} from "./kt-format";

export { KT_DOCS_BLOCK_END, KT_DOCS_BLOCK_START } from "./kt-format";

/** ~600 tokens at ~4 chars/token. */
export const KT_DOCS_SUFFIX_MAX_CHARS = 2400;
const SUMMARY_MAX_CHARS = 600;

export function buildKnowledgeSystemSuffix(
  knowledge: KnowledgeRepository | null | undefined,
): string | undefined {
  if (!knowledge || knowledge.pages.length === 0) return undefined;

  const summary =
    knowledge.summary.length > SUMMARY_MAX_CHARS
      ? `${knowledge.summary.slice(0, SUMMARY_MAX_CHARS).trimEnd()}...`
      : knowledge.summary.trim();
  const header = [
    KT_DOCS_BLOCK_START,
    `This repository has KT (knowledge transfer) docs: ${knowledge.title} (commit ${shortSha(knowledge.commitSha)}, generated ${knowledge.generatedAt.slice(0, 10)}).`,
    `If ${KT_INDEX_FILE} exists in your working directory, treat it as your helper map of the codebase.`,
    ktUsageGuidance(knowledge.commitSha),
    "",
    `Summary: ${summary}`,
    "",
    "Pages:",
  ].join("\n");

  // Highest-importance pages first, so truncation drops the least useful ones.
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const pages = [...knowledge.pages].sort(
    (a, b) => rank[a.importance] - rank[b.importance],
  );
  const lines: string[] = [];
  let length = header.length + KT_DOCS_BLOCK_END.length + 2;
  for (const page of pages) {
    const line = `- ${page.title} -> ${ktPagePath(page.id)}`;
    if (length + line.length + 1 > KT_DOCS_SUFFIX_MAX_CHARS) break;
    lines.push(line);
    length += line.length + 1;
  }

  return [header, ...lines, KT_DOCS_BLOCK_END].join("\n");
}

export interface KnowledgeLookup {
  workingDir?: string | null;
  /** `"owner/repo"`, as `selected_repository` carries it. */
  repository?: string | null;
  branch?: string | null;
}

/**
 * The ready KT docs for a conversation: generated for this exact workspace
 * path first, otherwise for the same repository (and branch, when known).
 * The fallback matters because KT generated in one folder -- or loaded from
 * Supabase with no folder at all -- still describes the repo a new chat in
 * another folder works on.
 */
export function findKnowledgeForConversation({
  workingDir,
  repository,
  branch,
}: KnowledgeLookup): KnowledgeRepository | null {
  const entries = Object.values(
    useKnowledgeStore.getState().byRepositoryId,
  ).filter((entry) => entry.knowledge);
  const target = workingDir ? normalizeWorkspacePath(workingDir) : "";
  const byPath = target
    ? entries.find(
        (entry) =>
          entry.snapshot.localPath &&
          normalizeWorkspacePath(entry.snapshot.localPath) === target,
      )
    : undefined;
  if (byPath) return byPath.knowledge;

  const repo = repository?.trim().toLowerCase();
  if (!repo) return null;
  const byRepo = entries.filter(
    (entry) =>
      `${entry.snapshot.owner}/${entry.snapshot.repo}`.toLowerCase() === repo &&
      (!branch || entry.snapshot.branch === branch),
  );
  // Newest generation wins when several branches/folders match.
  byRepo.sort((a, b) =>
    (b.knowledge?.generatedAt ?? "").localeCompare(
      a.knowledge?.generatedAt ?? "",
    ),
  );
  return byRepo[0]?.knowledge ?? null;
}

const MAX_RELEVANT_PAGES = 2;
const MIN_TOKEN_LENGTH = 3;
/** Path and prose noise that would match almost every page. */
const IGNORED_TOKENS = new Set([
  "src",
  "lib",
  "app",
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "tsx",
  "index",
  "test",
  "tests",
  "components",
  "utils",
  "please",
  "can",
  "you",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(
        (token) =>
          token.length >= MIN_TOKEN_LENGTH && !IGNORED_TOKENS.has(token),
      ),
  );
}

/**
 * Per-message pointer to the KT pages most related to the task. Rides on the
 * message (like workspace memory) because the launch-time system suffix is
 * dropped when a conversation starts from an agent profile. Returns "" when
 * nothing matches, so a casual message pays nothing.
 */
export function buildKtPagePointers(
  knowledge: KnowledgeRepository | null | undefined,
  task: string,
): string {
  if (!knowledge || !task.trim()) return "";
  const taskTokens = tokenize(task);
  if (taskTokens.size === 0) return "";

  const scored = knowledge.pages
    .map((page) => {
      const pageTokens = tokenize(
        [page.title, ...page.relevantFiles.map((file) => file.path)].join(" "),
      );
      let score = 0;
      pageTokens.forEach((token) => {
        if (taskTokens.has(token)) score += 1;
      });
      return { page, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELEVANT_PAGES);
  if (scored.length === 0) return "";

  return [
    KT_DOCS_BLOCK_START,
    `Relevant KT docs (see ${KT_INDEX_FILE}; written at commit ${shortSha(knowledge.commitSha)}, trust the code if they disagree):`,
    ...scored.map(({ page }) => `- ${page.title} -> ${ktPagePath(page.id)}`),
    KT_DOCS_BLOCK_END,
  ].join("\n");
}
