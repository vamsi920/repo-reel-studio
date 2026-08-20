/**
 * Ties CodeGraph nodes to the Knowledge docs DeepWiki already generated.
 *
 * CodeGraph is deliberately not a second documentation generator. DeepWiki has
 * already read this exact commit and produced named sections and pages with
 * source-file citations; this module reuses that work in two directions:
 *
 *   1. **Naming** — section titles become level-1 subsystem names, so the top
 *      of the graph reads "Payment Service", not `src/pay`.
 *   2. **Deeplinks** — a selected node offers [Read documentation] / [Watch KT]
 *      when, and only when, a real page covers it.
 *
 * The "only when" matters: if CodeGraph surfaces a component DeepWiki has no
 * page for, we show structural facts and no link. We never fabricate a page.
 */
import type {
  KnowledgePage,
  KnowledgeRepository,
} from "#/lib/knowledge/knowledge-engine";
import type { CodeGraphNode } from "./codegraph-types";
import type { SubsystemHint } from "./hierarchy";

function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/+/, "");
}

/**
 * Reduces a `KnowledgeRepository` to the plain-data hints the analyzer needs.
 * Sections own pages; a section's file set is the union of its pages' cited
 * files. Pages outside every section become their own single-page hint so
 * their naming still beats a folder name.
 */
export function toSubsystemHints(
  knowledge: KnowledgeRepository | undefined,
): SubsystemHint[] {
  if (!knowledge) return [];

  const pagesById = new Map(knowledge.pages.map((page) => [page.id, page]));
  const hints: SubsystemHint[] = [];
  const claimed = new Set<string>();

  for (const section of knowledge.sections) {
    const filePaths = new Set<string>();
    for (const pageId of section.pageIds) {
      claimed.add(pageId);
      const page = pagesById.get(pageId);
      if (!page) continue;
      for (const file of page.relevantFiles) {
        filePaths.add(normalizePath(file.path));
      }
    }
    if (filePaths.size === 0) continue;
    hints.push({
      id: section.id,
      title: section.title,
      filePaths: [...filePaths],
    });
  }

  for (const page of knowledge.pages) {
    if (claimed.has(page.id)) continue;
    const filePaths = page.relevantFiles.map((file) =>
      normalizePath(file.path),
    );
    if (filePaths.length === 0) continue;
    hints.push({ id: page.id, title: page.title, filePaths });
  }

  return hints;
}

export interface KnowledgeLink {
  pageId: string;
  pageTitle: string;
  /** Route for [Read documentation]. */
  readPath: string;
  /** Route for [Watch KT] — the existing watch mode on the same page. */
  watchPath: string;
}

/**
 * Builds an index from source file path to the Knowledge page that best covers
 * it. When several pages cite the same file the more important page wins, then
 * the one citing fewer files — a focused page describes a given file better
 * than a sprawling overview that merely mentions it.
 */
export class KnowledgeLinkIndex {
  private readonly byPath = new Map<string, KnowledgePage>();

  private readonly repositoryId: string;

  constructor(
    repositoryId: string,
    knowledge: KnowledgeRepository | undefined,
  ) {
    this.repositoryId = repositoryId;
    if (!knowledge) return;

    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    for (const page of knowledge.pages) {
      for (const file of page.relevantFiles) {
        const path = normalizePath(file.path);
        const current = this.byPath.get(path);
        if (!current) {
          this.byPath.set(path, page);
          continue;
        }
        const better =
          rank[page.importance] < rank[current.importance] ||
          (page.importance === current.importance &&
            page.relevantFiles.length < current.relevantFiles.length);
        if (better) this.byPath.set(path, page);
      }
    }
  }

  private link(page: KnowledgePage): KnowledgeLink {
    const base = `/kt/${encodeURIComponent(this.repositoryId)}/${encodeURIComponent(page.id)}`;
    return {
      pageId: page.id,
      pageTitle: page.title,
      readPath: base,
      watchPath: `${base}?view=watch`,
    };
  }

  /**
   * Resolves the documentation link for a node, or `null` when DeepWiki has no
   * page covering it. Aggregate nodes (subsystems, modules) resolve through
   * the files beneath them, picking the page that covers the most of them.
   */
  resolve(node: CodeGraphNode): KnowledgeLink | null {
    const paths = node.filePath ? [node.filePath] : node.filePaths;
    if (paths.length === 0) return null;

    const votes = new Map<string, { page: KnowledgePage; count: number }>();
    for (const path of paths) {
      const page = this.byPath.get(normalizePath(path));
      if (!page) continue;
      const entry = votes.get(page.id) ?? { page, count: 0 };
      entry.count += 1;
      votes.set(page.id, entry);
    }

    if (votes.size === 0) return null;

    const winner = [...votes.values()].sort((a, b) => b.count - a.count)[0];
    return this.link(winner.page);
  }
}
