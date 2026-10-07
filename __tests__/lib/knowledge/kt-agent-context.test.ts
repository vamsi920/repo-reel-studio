import { beforeEach, describe, expect, it } from "vitest";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import {
  buildKnowledgeSystemSuffix,
  buildKtPagePointers,
  findKnowledgeForConversation,
  KT_DOCS_SUFFIX_MAX_CHARS,
} from "#/lib/knowledge/kt-agent-context";
import { KT_KNOWLEDGE, KT_SNAPSHOT } from "./kt-fixtures";

describe("buildKnowledgeSystemSuffix", () => {
  it("points the agent at the KT index and lists pages by importance", () => {
    const suffix = buildKnowledgeSystemSuffix(KT_KNOWLEDGE) ?? "";

    expect(suffix).toContain("<KT_DOCS>");
    expect(suffix).toContain(".neodevex/kt/INDEX.md");
    expect(suffix.indexOf("Payments Flow")).toBeLessThan(
      suffix.indexOf("Checkout"),
    );
  });

  it("returns nothing without knowledge", () => {
    expect(buildKnowledgeSystemSuffix(null)).toBeUndefined();
  });

  it("stays within its size cap for large repositories", () => {
    const pages = Array.from({ length: 300 }, (_, i) => ({
      ...KT_KNOWLEDGE.pages[0],
      id: `page-${i}`,
      title: `A fairly long page title number ${i}`,
    }));

    const suffix = buildKnowledgeSystemSuffix({ ...KT_KNOWLEDGE, pages }) ?? "";

    expect(suffix.length).toBeLessThanOrEqual(KT_DOCS_SUFFIX_MAX_CHARS);
    expect(suffix.endsWith("</KT_DOCS>")).toBe(true);
  });
});

describe("buildKtPagePointers", () => {
  it("points at the pages that match the task", () => {
    const pointers = buildKtPagePointers(
      KT_KNOWLEDGE,
      "fix the payments capture retry",
    );

    expect(pointers).toContain(".neodevex/kt/pages/payments-flow.md");
    expect(pointers).not.toContain("checkout.md");
  });

  it("adds nothing when no page matches", () => {
    expect(buildKtPagePointers(KT_KNOWLEDGE, "hello there")).toBe("");
  });
});

describe("findKnowledgeForConversation", () => {
  beforeEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
    useKnowledgeStore
      .getState()
      .hydrate(KT_SNAPSHOT.repositoryId, KT_SNAPSHOT, KT_KNOWLEDGE, []);
  });

  it("finds knowledge generated for the same workspace path", () => {
    expect(
      findKnowledgeForConversation({ workingDir: "/workspace/shop/" }),
    ).toBe(KT_KNOWLEDGE);
  });

  it("falls back to the same repository and branch in another folder", () => {
    expect(
      findKnowledgeForConversation({
        workingDir: "/workspace/other",
        repository: "Acme/Shop",
        branch: "main",
      }),
    ).toBe(KT_KNOWLEDGE);
    expect(
      findKnowledgeForConversation({
        workingDir: "/workspace/other",
        repository: "acme/shop",
        branch: "develop",
      }),
    ).toBeNull();
  });
});
