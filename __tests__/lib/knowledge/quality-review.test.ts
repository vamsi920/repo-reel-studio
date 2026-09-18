import { describe, expect, it } from "vitest";

import { reviewKnowledgeQuality } from "#/lib/knowledge/quality-review";
import type {
  KnowledgePage,
  KnowledgeRepository,
} from "#/lib/knowledge/knowledge-engine";
import type { AnalysisHandle } from "#/lib/codegraph/analyzer-runner";
import type { CodeGraphNode } from "#/lib/codegraph/codegraph-types";

function page(overrides: Partial<KnowledgePage> = {}): KnowledgePage {
  return {
    id: "page-1",
    title: "Page One",
    description: "",
    contentMarkdown: "",
    importance: "medium",
    relevantFiles: [],
    diagrams: [],
    relatedPageIds: [],
    ...overrides,
  };
}

function knowledge(pages: KnowledgePage[]): KnowledgeRepository {
  return {
    repositoryId: "acme/api@main",
    commitSha: "abc123",
    title: "Acme API",
    summary: "",
    sections: [],
    pages,
    generatedAt: new Date().toISOString(),
  };
}

function node(id: string, filePaths: string[]): CodeGraphNode {
  return {
    id,
    level: "subsystem",
    type: "module",
    name: id,
    summary: "",
    complexity: "simple",
    tags: [],
    childCount: 0,
    filePaths,
  };
}

function handleWithFiles(filePaths: string[]): AnalysisHandle {
  return {
    meta: {
      workspaceId: "ws",
      repositoryId: "acme/api",
      commitSha: "abc123",
      generatedAt: new Date().toISOString(),
      fileCount: filePaths.length,
      symbolCount: 0,
      languages: [],
      frameworks: [],
    },
    root: {
      parentId: null,
      nodes: [node("node-0", filePaths)],
      edges: [],
      crumbs: [],
    },
    loadLevel: async () => null,
    loadSearchIndex: async () => [],
    readSource: async () => null,
  };
}

describe("reviewKnowledgeQuality", () => {
  it("flags a page with no citations at all", () => {
    const flags = reviewKnowledgeQuality(
      knowledge([page({ contentMarkdown: "No sources cited here." })]),
    );

    expect(flags).toEqual([
      expect.objectContaining({ pageId: "page-1", kind: "no-citations" }),
    ]);
  });

  it("flags a page with fewer than three citations as thin", () => {
    const flags = reviewKnowledgeQuality(
      knowledge([
        page({
          contentMarkdown: "See [src/a.ts:1]() and [src/b.ts:2]().",
          relevantFiles: [{ path: "src/a.ts" }, { path: "src/b.ts" }],
        }),
      ]),
    );

    expect(flags).toEqual([
      expect.objectContaining({
        pageId: "page-1",
        kind: "thin-citation-count",
      }),
    ]);
  });

  it("does not flag a page with three or more citations", () => {
    const flags = reviewKnowledgeQuality(
      knowledge([
        page({
          contentMarkdown: "[src/a.ts:1](), [src/b.ts:2](), [src/c.ts:3]().",
          relevantFiles: [
            { path: "src/a.ts" },
            { path: "src/b.ts" },
            { path: "src/c.ts" },
          ],
        }),
      ]),
    );

    expect(flags).toEqual([]);
  });

  it("flags a citation to a file the page never declared as relevant", () => {
    const flags = reviewKnowledgeQuality(
      knowledge([
        page({
          contentMarkdown:
            "[src/a.ts:1](), [src/b.ts:2](), [src/undeclared.ts:3]().",
          relevantFiles: [{ path: "src/a.ts" }, { path: "src/b.ts" }],
        }),
      ]),
    );

    expect(flags).toContainEqual(
      expect.objectContaining({
        pageId: "page-1",
        kind: "undeclared-citation",
        detail: expect.stringContaining("src/undeclared.ts"),
      }),
    );
  });

  it("flags a page whose relevant files land in no analyzer subsystem", () => {
    const handle = handleWithFiles(["src/known.ts"]);
    const flags = reviewKnowledgeQuality(
      knowledge([
        page({
          contentMarkdown: "[src/unknown.ts:1](), [src/unknown.ts:2]().",
          relevantFiles: [{ path: "src/unknown.ts" }],
        }),
      ]),
      handle,
    );

    expect(flags).toContainEqual(
      expect.objectContaining({
        pageId: "page-1",
        kind: "evidence-subsystem-orphan",
      }),
    );
  });

  it("does not flag evidence-subsystem-orphan when a relevant file matches a subsystem", () => {
    const handle = handleWithFiles(["src/known.ts"]);
    const flags = reviewKnowledgeQuality(
      knowledge([
        page({
          contentMarkdown:
            "[src/known.ts:1](), [src/known.ts:2](), [src/known.ts:3]().",
          relevantFiles: [{ path: "src/known.ts" }],
        }),
      ]),
      handle,
    );

    expect(flags.some((f) => f.kind === "evidence-subsystem-orphan")).toBe(
      false,
    );
  });

  it("skips the evidence-subsystem-orphan check entirely when no handle is provided", () => {
    const flags = reviewKnowledgeQuality(
      knowledge([
        page({
          contentMarkdown: "[src/a.ts:1](), [src/b.ts:2](), [src/c.ts:3]().",
          relevantFiles: [
            { path: "src/a.ts" },
            { path: "src/b.ts" },
            { path: "src/c.ts" },
          ],
        }),
      ]),
    );

    expect(flags.some((f) => f.kind === "evidence-subsystem-orphan")).toBe(
      false,
    );
  });

  it("returns no flags for a repository with no pages", () => {
    expect(reviewKnowledgeQuality(knowledge([]))).toEqual([]);
  });
});
