/**
 * Pure KT docs formatting: turns a generated `KnowledgeRepository` into the
 * markdown files agents read. Shared by the in-app workspace export
 * (`kt-workspace-export.ts`) and the `npm run kt:export` CLI
 * (`scripts/export-kt-docs.mjs`), so it must stay free of `#/` alias imports
 * and runtime dependencies -- Node imports this file directly (type
 * stripping), with no bundler in between.
 */
import type {
  KnowledgePage,
  KnowledgeRepository,
  RepositorySnapshot,
} from "./knowledge-engine";

export const KT_DIR = ".neodevex/kt";
export const KT_INDEX_FILE = `${KT_DIR}/INDEX.md`;
export const KT_PAGES_DIR = `${KT_DIR}/pages`;
export const KT_META_FILE = `${KT_DIR}/meta.json`;
/** Delimit KT context injected into prompts, so it can be found and hidden. */
export const KT_DOCS_BLOCK_START = "<KT_DOCS>";
export const KT_DOCS_BLOCK_END = "</KT_DOCS>";

/** Where this repository's own KT docs are committed, for cloud clones. */
export const KT_COMMITTED_DIR = "docs/kt";

export interface KtFile {
  path: string;
  content: string;
}

export interface BuildKtFilesOptions {
  /** Output root; defaults to `.neodevex/kt`. Page links stay relative. */
  rootDir?: string;
}

/** Page ids come from DeepWiki; never trust them as path segments. */
export function ktPageFileName(pageId: string): string {
  const safe = pageId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safe || "page"}.md`;
}

export function ktPagePath(pageId: string, rootDir = KT_DIR): string {
  return `${rootDir}/pages/${ktPageFileName(pageId)}`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 8);
}

function formatFileRef(file: KnowledgePage["relevantFiles"][number]): string {
  if (file.startLine && file.endLine) {
    return `${file.path}:${file.startLine}-${file.endLine}`;
  }
  if (file.startLine) return `${file.path}:${file.startLine}`;
  return file.path;
}

/**
 * Short "how to use these docs" contract, shared by INDEX and agent prompts.
 * Names the commit the docs describe so the agent can measure drift itself
 * instead of trusting a stale page.
 */
export function ktUsageGuidance(commitSha: string, rootDir = KT_DIR): string {
  const lines = [
    `Read ${rootDir}/INDEX.md first for the architecture map, then open the relevant page under ${rootDir}/pages/ before planning a change in that area.`,
    "Each page lists the source files it describes; use them as your starting points.",
    "KT docs are generated and may lag the code: if a doc and the code disagree, trust the code.",
  ];
  if (commitSha) {
    lines.push(
      `These docs describe commit ${shortSha(commitSha)}. Run \`git diff --stat ${commitSha}..HEAD\` and re-check any page whose files changed since.`,
    );
  }
  return lines.join("\n");
}

function buildIndex(
  knowledge: KnowledgeRepository,
  snapshot: RepositorySnapshot,
  rootDir: string,
): string {
  const commitSha = knowledge.commitSha || snapshot.commitSha;
  const pagesById = new Map(knowledge.pages.map((page) => [page.id, page]));
  const listed = new Set<string>();
  const lines: string[] = [
    `# KT docs: ${knowledge.title || `${snapshot.owner}/${snapshot.repo}`}`,
    "",
    `- Repository: ${snapshot.owner}/${snapshot.repo}`,
    `- Branch: ${snapshot.branch}`,
    `- Commit: ${commitSha}`,
    `- Generated: ${knowledge.generatedAt}`,
    "",
    "## How to use",
    "",
    ktUsageGuidance(commitSha, rootDir),
    "",
    "## Summary",
    "",
    knowledge.summary.trim(),
    "",
  ];

  const renderPage = (page: KnowledgePage) => {
    listed.add(page.id);
    const files = page.relevantFiles.slice(0, 5).map(formatFileRef);
    lines.push(
      `- [${page.title}](pages/${ktPageFileName(page.id)}) (${page.importance})${
        page.description ? ` - ${page.description}` : ""
      }`,
    );
    if (files.length > 0) lines.push(`  - Files: ${files.join(", ")}`);
  };

  knowledge.sections.forEach((section) => {
    const pages = section.pageIds
      .map((id) => pagesById.get(id))
      .filter((page): page is KnowledgePage => Boolean(page));
    if (pages.length === 0) return;
    lines.push(`## ${section.title}`, "");
    if (section.description) lines.push(section.description, "");
    pages.forEach(renderPage);
    lines.push("");
  });

  const unsectioned = knowledge.pages.filter((page) => !listed.has(page.id));
  if (unsectioned.length > 0) {
    lines.push("## Other pages", "");
    unsectioned.forEach(renderPage);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function buildPage(
  page: KnowledgePage,
  knowledge: KnowledgeRepository,
): string {
  const titles = new Map(knowledge.pages.map((p) => [p.id, p.title]));
  const lines: string[] = [`# ${page.title}`, ""];
  if (page.description) lines.push(`> ${page.description}`, "");
  lines.push(`Importance: ${page.importance}`, "");

  if (page.relevantFiles.length > 0) {
    lines.push("## Relevant files", "");
    page.relevantFiles.forEach((file) => {
      lines.push(
        `- ${formatFileRef(file)}${file.symbol ? ` (${file.symbol})` : ""}`,
      );
    });
    lines.push("");
  }

  lines.push(page.contentMarkdown.trim(), "");

  page.diagrams.forEach((diagram) => {
    lines.push(
      `## Diagram: ${diagram.type}`,
      "",
      "```mermaid",
      diagram.mermaid.trim(),
      "```",
      "",
    );
  });

  const related = page.relatedPageIds.filter((id) => titles.has(id));
  if (related.length > 0) {
    lines.push("## Related pages", "");
    related.forEach((id) => {
      lines.push(`- [${titles.get(id)}](${ktPageFileName(id)})`);
    });
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/** Pure: every file an export writes, so tests never need a runtime. */
export function buildKtFiles(
  knowledge: KnowledgeRepository,
  snapshot: RepositorySnapshot,
  options: BuildKtFilesOptions = {},
): KtFile[] {
  const rootDir = options.rootDir ?? KT_DIR;
  const meta = {
    repositoryId: snapshot.repositoryId,
    owner: snapshot.owner,
    repo: snapshot.repo,
    branch: snapshot.branch,
    commitSha: knowledge.commitSha || snapshot.commitSha,
    generatedAt: knowledge.generatedAt,
    pageCount: knowledge.pages.length,
  };
  return [
    {
      path: `${rootDir}/INDEX.md`,
      content: buildIndex(knowledge, snapshot, rootDir),
    },
    ...knowledge.pages.map((page) => ({
      path: ktPagePath(page.id, rootDir),
      content: buildPage(page, knowledge),
    })),
    {
      path: `${rootDir}/meta.json`,
      content: `${JSON.stringify(meta, null, 2)}\n`,
    },
  ];
}
