import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

const mockUsePaginatedConversations = vi.fn();
vi.mock("#/hooks/query/use-paginated-conversations", () => ({
  usePaginatedConversations: (...args: unknown[]) =>
    mockUsePaginatedConversations(...args),
}));

const getGitCommits = vi.fn();
vi.mock("#/api/git-service/agent-server-git-service.api", () => ({
  default: {
    getGitCommits: (...args: unknown[]) => getGitCommits(...args),
  },
}));

const { useConnectedRepositories, resolveCommitSha } = await import(
  "#/lib/knowledge/connected-repositories"
);

function conversation(
  overrides: Partial<AppConversation> = {},
): AppConversation {
  return {
    selected_repository: "acme/api",
    selected_branch: "main",
    conversation_url: "https://conversation.example",
    session_api_key: "session-key",
    workspace: { working_dir: "/workspace/acme-api" },
    ...overrides,
  } as AppConversation;
}

describe("useConnectedRepositories", () => {
  beforeEach(() => {
    mockUsePaginatedConversations.mockReset();
  });

  it("reports loading while the conversation history query hasn't answered yet", () => {
    mockUsePaginatedConversations.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { result } = renderHook(() => useConnectedRepositories());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.repositories).toEqual([]);
  });

  it("reports isError when the conversation history query itself failed", () => {
    mockUsePaginatedConversations.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const { result } = renderHook(() => useConnectedRepositories());

    expect(result.current.isError).toBe(true);
    expect(result.current.repositories).toEqual([]);
  });

  it("skips conversations with no selected repository", () => {
    mockUsePaginatedConversations.mockReturnValue({
      data: { pages: [{ items: [conversation({ selected_repository: null })] }] },
      isLoading: false,
    });

    const { result } = renderHook(() => useConnectedRepositories());

    expect(result.current.repositories).toEqual([]);
  });

  it("defaults to the main branch and keys the repository id as owner/repo@branch", () => {
    mockUsePaginatedConversations.mockReturnValue({
      data: {
        pages: [{ items: [conversation({ selected_branch: null })] }],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useConnectedRepositories());

    expect(result.current.repositories).toEqual([
      {
        repositoryId: "acme/api@main",
        owner: "acme",
        repo: "api",
        branch: "main",
        conversationUrl: "https://conversation.example",
        sessionApiKey: "session-key",
        workingDir: "/workspace/acme-api",
      },
    ]);
  });

  it("keeps only the first conversation seen for a repeated repositoryId", () => {
    mockUsePaginatedConversations.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              conversation({ conversation_url: "https://first.example" }),
              conversation({ conversation_url: "https://second.example" }),
            ],
          },
        ],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useConnectedRepositories());

    expect(result.current.repositories).toHaveLength(1);
    expect(result.current.repositories[0].conversationUrl).toBe(
      "https://first.example",
    );
  });

  it("flattens every page of conversation history", () => {
    mockUsePaginatedConversations.mockReturnValue({
      data: {
        pages: [
          { items: [conversation({ selected_repository: "acme/api" })] },
          { items: [conversation({ selected_repository: "acme/widgets" })] },
        ],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useConnectedRepositories());

    expect(result.current.repositories.map((r) => r.repositoryId).sort()).toEqual(
      ["acme/api@main", "acme/widgets@main"],
    );
  });

  it("normalizes a blank working_dir to null instead of an empty string", () => {
    mockUsePaginatedConversations.mockReturnValue({
      data: {
        pages: [
          {
            items: [conversation({ workspace: { working_dir: "   " } })],
          },
        ],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useConnectedRepositories());

    expect(result.current.repositories[0].workingDir).toBeNull();
  });
});

describe("resolveCommitSha", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getGitCommits.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function settle<T>(promise: Promise<T>): Promise<T> {
    const outcome = promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    await vi.runAllTimersAsync();
    const result = await outcome;
    if (!result.ok) throw result.error;
    return result.value;
  }

  it("returns the first commit as soon as the clone produces one", async () => {
    getGitCommits.mockResolvedValueOnce({
      commits: [{ sha: "abc123" }],
      has_more: false,
    });

    const sha = await settle(
      resolveCommitSha(
        "acme",
        "api",
        "/workspace/acme-api",
        "https://conversation.example",
        "session-key",
      ),
    );

    expect(sha).toBe("abc123");
    expect(getGitCommits).toHaveBeenCalledTimes(1);
  });

  it("polls again when the clone hasn't produced any commits yet", async () => {
    getGitCommits
      .mockResolvedValueOnce({ commits: [], has_more: false })
      .mockResolvedValueOnce({ commits: [{ sha: "def456" }], has_more: false });

    const sha = await settle(
      resolveCommitSha(
        "acme",
        "api",
        "/workspace/acme-api",
        "https://conversation.example",
        "session-key",
      ),
    );

    expect(sha).toBe("def456");
    expect(getGitCommits).toHaveBeenCalledTimes(2);
  });

  it("throws a clear error once the clone never produces a commit before the deadline", async () => {
    getGitCommits.mockResolvedValue({ commits: [], has_more: false });

    await expect(
      settle(
        resolveCommitSha(
          "acme",
          "api",
          "/workspace/acme-api",
          "https://conversation.example",
          "session-key",
        ),
      ),
    ).rejects.toThrow(/Couldn't resolve a commit/);
  });
});
