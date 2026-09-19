import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  KnowledgePage,
  KnowledgeRepository,
  RepositorySnapshot,
} from "#/lib/knowledge/knowledge-engine";

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));
vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), parse: parseMock },
}));

const chatCompletion = vi.fn();
vi.mock("#/api/deepwiki-service/deepwiki-service.api", () => ({
  default: { chatCompletion: (...args: unknown[]) => chatCompletion(...args) },
}));

const targetState = vi.hoisted(() => ({ localConnected: false }));
vi.mock("#/api/git-service/github-connection-flag", () => ({
  isLocalGithubConnected: () => targetState.localConnected,
}));
vi.mock("#/api/git-service/mint-local-github-clone-credential", () => ({
  mintGithubCloneToken: vi.fn(),
}));

const { repairInvalidDiagrams } =
  await import("#/lib/knowledge/mermaid-repair");

const snapshot: RepositorySnapshot = {
  repositoryId: "acme/api@main",
  owner: "acme",
  repo: "api",
  branch: "main",
  commitSha: "abc123",
  localPath: "/workspace/api",
};

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

describe("repairInvalidDiagrams", () => {
  beforeEach(() => {
    parseMock.mockReset();
    chatCompletion.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves already-valid diagrams untouched and never calls the repair API", async () => {
    parseMock.mockResolvedValue(true);
    const input = knowledge([
      page({
        diagrams: [{ id: "d1", type: "flow", mermaid: "graph TD; A-->B;" }],
      }),
    ]);

    const result = await repairInvalidDiagrams(input, snapshot);

    expect(result.pages[0]!.diagrams[0]!.mermaid).toBe("graph TD; A-->B;");
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("replaces an invalid diagram with a successfully repaired one", async () => {
    parseMock
      .mockRejectedValueOnce(new Error("Parse error on line 1"))
      .mockResolvedValueOnce(true);
    chatCompletion.mockResolvedValue(
      "Here you go:\n```mermaid\ngraph TD; A-->B;\n```",
    );
    const input = knowledge([
      page({ diagrams: [{ id: "d1", type: "flow", mermaid: "graph TD A" }] }),
    ]);

    const result = await repairInvalidDiagrams(input, snapshot);

    expect(result.pages[0]!.diagrams[0]!.mermaid).toBe("graph TD; A-->B;");
    expect(chatCompletion).toHaveBeenCalledTimes(1);
  });

  it("keeps the original diagram when the repair attempt still fails to parse", async () => {
    parseMock.mockRejectedValue(new Error("still broken"));
    chatCompletion.mockResolvedValue("```mermaid\nstill broken\n```");
    const input = knowledge([
      page({ diagrams: [{ id: "d1", type: "flow", mermaid: "still broken" }] }),
    ]);

    const result = await repairInvalidDiagrams(input, snapshot);

    expect(result.pages[0]!.diagrams[0]!.mermaid).toBe("still broken");
  });

  it("keeps the original diagram when the repair API call itself throws", async () => {
    parseMock.mockRejectedValue(new Error("broken"));
    chatCompletion.mockRejectedValue(new Error("network down"));
    const input = knowledge([
      page({ diagrams: [{ id: "d1", type: "flow", mermaid: "broken" }] }),
    ]);

    const result = await repairInvalidDiagrams(input, snapshot);

    expect(result.pages[0]!.diagrams[0]!.mermaid).toBe("broken");
  });

  it("resolves the DeepWiki target only once and reuses it across multiple invalid diagrams", async () => {
    parseMock.mockRejectedValue(new Error("broken"));
    chatCompletion.mockResolvedValue("```mermaid\nbroken\n```");
    const input = knowledge([
      page({
        id: "page-a",
        diagrams: [
          { id: "d1", type: "flow", mermaid: "broken-1" },
          { id: "d2", type: "flow", mermaid: "broken-2" },
        ],
      }),
    ]);

    await repairInvalidDiagrams(input, snapshot);

    expect(chatCompletion).toHaveBeenCalledTimes(2);
    // Both calls resolved the same (mocked, non-GitHub-connected) local target.
    for (const call of chatCompletion.mock.calls) {
      expect(call[0]).toMatchObject({
        repo_url: snapshot.localPath,
        type: "local",
      });
    }
  });

  it("skips pages with no diagrams entirely", async () => {
    const input = knowledge([page({ diagrams: [] })]);

    const result = await repairInvalidDiagrams(input, snapshot);

    expect(result.pages[0]!.diagrams).toEqual([]);
    expect(parseMock).not.toHaveBeenCalled();
    expect(chatCompletion).not.toHaveBeenCalled();
  });
});
