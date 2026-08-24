import type { AnalysisHandle } from "#/lib/codegraph/analyzer-runner";
import { extractCitedRanges } from "./citation-parser";
import type { KnowledgeRepository } from "./knowledge-engine";

export type PageQualityFlagKind =
  | "no-citations"
  | "thin-citation-count"
  | "evidence-subsystem-orphan"
  | "undeclared-citation";

export interface PageQualityFlag {
  pageId: string;
  kind: PageQualityFlagKind;
  detail: string;
}

const THIN_CITATION_THRESHOLD = 3;

/**
 * A cheap heuristic pass over freshly generated Knowledge — not a second LLM
 * judge (disproportionate cost for unverified value at this stage). Flags
 * pages with weak source grounding so quality problems are visible instead
 * of silently accepted just because JSON validation passed.
 */
export function reviewKnowledgeQuality(
  knowledge: KnowledgeRepository,
  handle?: AnalysisHandle,
): PageQualityFlag[] {
  const flags: PageQualityFlag[] = [];

  for (const page of knowledge.pages) {
    const cited = extractCitedRanges(page.contentMarkdown);
    if (cited.size === 0) {
      flags.push({
        pageId: page.id,
        kind: "no-citations",
        detail: `"${page.title}" cites no source files — it may be paraphrasing prose (e.g. a README) instead of the code it claims to document.`,
      });
    } else if (cited.size < THIN_CITATION_THRESHOLD) {
      flags.push({
        pageId: page.id,
        kind: "thin-citation-count",
        detail: `"${page.title}" cites only ${cited.size} location(s) — thin grounding for a page meant to explain real implementation.`,
      });
    }

    // Regression detector for the RAG side-channel bug fixed in
    // research.py's research_chat(skip_rag=True): a citation to a file the
    // page never declared as relevant means the model drew on retrieval it
    // shouldn't have had access to, with unverified line-number accuracy.
    const declaredPaths = new Set(page.relevantFiles.map((f) => f.path));
    const undeclared = [...cited.keys()].filter((p) => !declaredPaths.has(p));
    if (undeclared.length > 0) {
      flags.push({
        pageId: page.id,
        kind: "undeclared-citation",
        detail: `"${page.title}" cites ${undeclared.length} file(s) not in its declared relevant files (${undeclared.slice(0, 3).join(", ")}${undeclared.length > 3 ? ", ..." : ""}) — likely from unverified retrieval rather than the page's actual source evidence.`,
      });
    }

    if (handle) {
      const inAnySubsystem = page.relevantFiles.some((file) =>
        handle.root.nodes.some((node) => node.filePaths.includes(file.path)),
      );
      if (page.relevantFiles.length > 0 && !inAnySubsystem) {
        flags.push({
          pageId: page.id,
          kind: "evidence-subsystem-orphan",
          detail: `"${page.title}"'s relevant files don't land in any subsystem the real code analysis detected — its scope may not correspond to an actual part of this codebase.`,
        });
      }
    }
  }

  return flags;
}
