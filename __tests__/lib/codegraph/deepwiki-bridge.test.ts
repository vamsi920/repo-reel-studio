import { describe, expect, it } from "vitest";
import {
  KnowledgeLinkIndex,
  toSubsystemHints,
} from "#/lib/codegraph/deepwiki-bridge";
import type {
  KnowledgePage,
  KnowledgeRepository,
} from "#/lib/knowledge/knowledge-engine";
import type { CodeGraphNode } from "#/lib/codegraph/codegraph-types";

function page(
  id: string,
  title: string,
  paths: string[],
  importance: KnowledgePage["importance"] = "medium",
): KnowledgePage {
  return {
    id,
    title,
    description: "",
    contentMarkdown: "",
    importance,
    relevantFiles: paths.map((path) => ({ path })),
    diagrams: [],
    relatedPageIds: [],
  };
}

function repository(
  pages: KnowledgePage[],
  sections: KnowledgeRepository["sections"] = [],
): KnowledgeRepository {
  return {
    repositoryId: "acme/app",
    commitSha: "abc1234",
    title: "Acme",
    summary: "",
    sections,
    pages,
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function node(overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return {
    id: "file:src/pay/charge.ts",
    level: "unit",
    type: "file",
    name: "charge.ts",
    summary: "",
    complexity: "simple",
    tags: [],
    filePath: "src/pay/charge.ts",
    childCount: 0,
    filePaths: ["src/pay/charge.ts"],
    ...overrides,
  };
}

describe("toSubsystemHints", () => {
  it("unions the files cited by every page in a section", () => {
    const hints = toSubsystemHints(
      repository(
        [
          page("p1", "Charging", ["src/pay/charge.ts"]),
          page("p2", "Refunds", ["src/pay/refund.ts"]),
        ],
        [
          {
            id: "s1",
            title: "Payment Service",
            pageIds: ["p1", "p2"],
          },
        ],
      ),
    );

    expect(hints).toEqual([
      {
        id: "s1",
        title: "Payment Service",
        filePaths: ["src/pay/charge.ts", "src/pay/refund.ts"],
      },
    ]);
  });

  it("keeps unsectioned pages as their own hint so their naming still counts", () => {
    const hints = toSubsystemHints(
      repository([page("loose", "Background Jobs", ["src/jobs/run.ts"])]),
    );

    expect(hints).toEqual([
      { id: "loose", title: "Background Jobs", filePaths: ["src/jobs/run.ts"] },
    ]);
  });

  it("normalizes leading ./ so paths match the analyzer's own form", () => {
    const hints = toSubsystemHints(
      repository([page("p", "Jobs", ["./src/jobs/run.ts"])]),
    );

    expect(hints[0].filePaths).toEqual(["src/jobs/run.ts"]);
  });

  it("skips sections that cite no files at all", () => {
    const hints = toSubsystemHints(
      repository(
        [page("p1", "Empty", [])],
        [{ id: "s1", title: "Nothing", pageIds: ["p1"] }],
      ),
    );

    expect(hints).toEqual([]);
  });

  it("returns nothing when Knowledge has not been generated", () => {
    expect(toSubsystemHints(undefined)).toEqual([]);
  });
});

describe("KnowledgeLinkIndex", () => {
  it("links a node to the page covering its file", () => {
    const index = new KnowledgeLinkIndex(
      "acme/app",
      repository([page("charging", "Charging", ["src/pay/charge.ts"])]),
    );

    const link = index.resolve(node());

    expect(link).toEqual({
      pageId: "charging",
      pageTitle: "Charging",
      readPath: "/kt/acme%2Fapp/charging",
      watchPath: "/kt/acme%2Fapp/charging?view=watch",
    });
  });

  it("returns null rather than inventing a page for an uncovered node", () => {
    const index = new KnowledgeLinkIndex(
      "acme/app",
      repository([page("other", "Something Else", ["src/unrelated.ts"])]),
    );

    expect(index.resolve(node())).toBeNull();
  });

  it("returns null when there is no Knowledge at all", () => {
    const index = new KnowledgeLinkIndex("acme/app", undefined);
    expect(index.resolve(node())).toBeNull();
  });

  it("prefers the more important page when two cover the same file", () => {
    const index = new KnowledgeLinkIndex(
      "acme/app",
      repository([
        page("low", "Appendix", ["src/pay/charge.ts"], "low"),
        page("high", "Payments", ["src/pay/charge.ts"], "high"),
      ]),
    );

    expect(index.resolve(node())?.pageId).toBe("high");
  });

  it("prefers the more focused page when importance ties", () => {
    const index = new KnowledgeLinkIndex(
      "acme/app",
      repository([
        page("broad", "Overview", [
          "src/pay/charge.ts",
          "src/a.ts",
          "src/b.ts",
        ]),
        page("narrow", "Charging", ["src/pay/charge.ts"]),
      ]),
    );

    expect(index.resolve(node())?.pageId).toBe("narrow");
  });

  it("resolves an aggregate node through the files beneath it, by majority", () => {
    const index = new KnowledgeLinkIndex(
      "acme/app",
      repository([
        page("payments", "Payments", ["src/pay/a.ts", "src/pay/b.ts"]),
        page("misc", "Misc", ["src/pay/c.ts"]),
      ]),
    );

    const subsystem = node({
      id: "subsystem:payments",
      level: "subsystem",
      type: "service",
      name: "Payments",
      filePath: undefined,
      childCount: 3,
      filePaths: ["src/pay/a.ts", "src/pay/b.ts", "src/pay/c.ts"],
    });

    expect(index.resolve(subsystem)?.pageId).toBe("payments");
  });

  it("returns null for an aggregate whose files no page covers", () => {
    const index = new KnowledgeLinkIndex(
      "acme/app",
      repository([page("payments", "Payments", ["src/pay/a.ts"])]),
    );

    const subsystem = node({
      id: "subsystem:vendor",
      level: "subsystem",
      filePath: undefined,
      filePaths: ["vendor/x.ts", "vendor/y.ts"],
    });

    expect(index.resolve(subsystem)).toBeNull();
  });
});
