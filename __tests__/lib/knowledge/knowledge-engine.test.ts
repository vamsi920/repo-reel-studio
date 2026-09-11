import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeepWikiService, {
  DeepWikiServiceError,
} from "#/api/deepwiki-service/deepwiki-service.api";
import type {
  DeepWikiWikiCacheData,
  DeepWikiWikiTaskStatus,
} from "#/api/deepwiki-service/deepwiki-service.types";
import {
  DeepWikiKnowledgeEngine,
  type RepositorySnapshot,
} from "#/lib/knowledge/knowledge-engine";

vi.mock("#/api/deepwiki-service/deepwiki-service.api", async () => {
  class MockDeepWikiServiceError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
      this.name = "DeepWikiServiceError";
    }
  }
  return {
    default: {
      submitWikiTask: vi.fn(),
      getWikiTask: vi.fn(),
      getWikiCache: vi.fn(),
      streamWikiTask: vi.fn(),
    },
    DeepWikiServiceError: MockDeepWikiServiceError,
  };
});

const submitWikiTask = vi.mocked(DeepWikiService.submitWikiTask);
const getWikiTask = vi.mocked(DeepWikiService.getWikiTask);
const getWikiCache = vi.mocked(DeepWikiService.getWikiCache);
const streamWikiTask = vi.mocked(DeepWikiService.streamWikiTask);

// Real (unmocked) resolveDeepWikiRepoTarget is exercised here, with just its
// two lower-level dependencies faked -- covers the engine actually wiring a
// resolved GitHub target through, on top of deepwiki-repo-target.test.ts's
// own coverage of the resolution logic itself.
const githubTargetState = vi.hoisted(() => ({ localConnected: false }));
vi.mock("#/api/git-service/github-connection-flag", () => ({
  isLocalGithubConnected: () => githubTargetState.localConnected,
}));
const mintGithubCloneToken = vi.fn();
vi.mock("#/api/git-service/mint-local-github-clone-credential", () => ({
  mintGithubCloneToken: (...args: unknown[]) => mintGithubCloneToken(...args),
}));

type StreamHandlers = Parameters<typeof DeepWikiService.streamWikiTask>[1];

const snapshot: RepositorySnapshot = {
  repositoryId: "acme/api@main",
  owner: "acme",
  repo: "api",
  branch: "main",
  commitSha: "abc123",
  localPath: "/workspace/api",
};

function taskStatus(
  overrides: Partial<DeepWikiWikiTaskStatus>,
): DeepWikiWikiTaskStatus {
  return {
    id: "task-1",
    owner: "acme",
    repo: "api",
    repo_type: "local",
    language: "en",
    status: "generating",
    pages_done: 0,
    pages_total: 2,
    current_page_ids: [],
    error: null,
    submitted_at: 0,
    name: "acme/api",
    wiki_structure: null,
    ...overrides,
  };
}

const cache: DeepWikiWikiCacheData = {
  wiki_structure: {
    id: "wiki",
    title: "Acme API",
    description: "How the API fits together.",
    pages: [
      {
        id: "overview",
        title: "Overview",
        content: "",
        filePaths: ["src/index.ts"],
        importance: "HIGH ",
        relatedPages: ["routing"],
      },
      {
        id: "routing",
        title: "Routing",
        content: "",
        filePaths: ["src/router.ts"],
        importance: "critical",
        relatedPages: [],
      },
    ],
    sections: [{ id: "core", title: "Core", pages: ["overview"] }],
  },
  generated_pages: {
    overview: {
      id: "overview",
      title: "Overview",
      content:
        "The entry point wires everything up.\n\n```mermaid\nflowchart TD\n  A[Server] --> B[Router]\n```\n\nSources: [src/index.ts:10-42]()",
      filePaths: ["src/index.ts"],
      importance: "HIGH ",
      relatedPages: ["routing"],
      description: "  Where requests enter.  ",
    },
  },
};

const completed = taskStatus({
  status: "completed",
  wiki_structure: cache.wiki_structure,
});

/** Queues up what each successive `streamWikiTask` subscription does. */
function scriptStream(...scripts: ((handlers: StreamHandlers) => void)[]) {
  const unsubscribe = vi.fn();
  let call = 0;
  streamWikiTask.mockImplementation((_taskId, handlers) => {
    const script = scripts[call];
    call += 1;
    // Deliver asynchronously, like a real EventSource would.
    if (script) queueMicrotask(() => script(handlers));
    return unsubscribe;
  });
  return unsubscribe;
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  // Observe the outcome before advancing timers so a rejection raised while
  // the fake clock runs is never seen as unhandled.
  const outcome = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  // Each reconnect waits on a real timer before asking DeepWiki again.
  await vi.runAllTimersAsync();
  const result = await outcome;
  if (!result.ok) throw result.error;
  return result.value;
}

describe("DeepWikiKnowledgeEngine.generate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    submitWikiTask.mockResolvedValue({
      task_id: "task-1",
      status: "pending",
      created: true,
      joined: false,
      from_cache: false,
    });
    getWikiCache.mockResolvedValue(cache);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    githubTargetState.localConnected = false;
  });

  it("normalizes the finished wiki cache into a KnowledgeRepository", async () => {
    scriptStream((h) => h.onDone(completed));
    const onProgress = vi.fn();

    const knowledge = await settle(
      new DeepWikiKnowledgeEngine({ onProgress }).generate(snapshot),
    );

    expect(knowledge.repositoryId).toBe("acme/api@main");
    expect(knowledge.commitSha).toBe("abc123");
    expect(knowledge.title).toBe("Acme API");
    expect(knowledge.sections).toEqual([
      { id: "core", title: "Core", pageIds: ["overview"] },
    ]);

    const [overview, routing] = knowledge.pages;
    expect(overview).toMatchObject({
      id: "overview",
      description: "Where requests enter.",
      importance: "high",
      parentSectionId: "core",
      relevantFiles: [{ path: "src/index.ts", startLine: 10, endLine: 42 }],
      relatedPageIds: ["routing"],
    });
    expect(overview.diagrams).toEqual([
      {
        id: "overview-diagram-0",
        type: "flow",
        mermaid: "flowchart TD\n  A[Server] --> B[Router]",
      },
    ]);
    // Never generated (no cache entry) — falls back to the structure's own
    // page metadata, with an unknown importance coerced rather than trusted.
    expect(routing).toMatchObject({
      id: "routing",
      importance: "medium",
      relevantFiles: [{ path: "src/router.ts" }],
      diagrams: [],
    });
    expect(routing.parentSectionId).toBeUndefined();
    expect(onProgress).toHaveBeenCalledWith(completed);
    expect(getWikiCache).toHaveBeenCalledWith(
      "acme",
      "api",
      "local",
      "en",
      "abc123",
    );
  });

  it("clones by URL with a scoped token when a local GitHub connection is available", async () => {
    githubTargetState.localConnected = true;
    mintGithubCloneToken.mockResolvedValue({
      token: "gh-token-123",
      host: "github.com",
    });
    scriptStream((h) => h.onDone(completed));

    await settle(new DeepWikiKnowledgeEngine().generate(snapshot));

    expect(submitWikiTask).toHaveBeenCalledWith(
      expect.objectContaining({
        repo_url: "https://github.com/acme/api",
        type: "github",
        token: "gh-token-123",
      }),
    );
    expect(getWikiCache).toHaveBeenCalledWith(
      "acme",
      "api",
      "github",
      "en",
      "abc123",
    );
  });

  it("surfaces DeepWiki's own failure reason", async () => {
    scriptStream((h) =>
      h.onError(taskStatus({ status: "failed", error: "LLM quota exceeded" })),
    );

    await expect(
      settle(new DeepWikiKnowledgeEngine().generate(snapshot)),
    ).rejects.toThrow("LLM quota exceeded");
    expect(getWikiCache).not.toHaveBeenCalled();
  });

  it("re-attaches to a still-running task after the stream drops", async () => {
    scriptStream(
      (h) => {
        h.onProgress(taskStatus({ status: "indexing" }));
        h.onError(new Error("DeepWiki progress stream disconnected"));
      },
      (h) => h.onDone(completed),
    );
    getWikiTask.mockResolvedValue(taskStatus({ status: "generating" }));
    const onProgress = vi.fn();

    const knowledge = await settle(
      new DeepWikiKnowledgeEngine({ onProgress }).generate(snapshot),
    );

    expect(knowledge.title).toBe("Acme API");
    expect(streamWikiTask).toHaveBeenCalledTimes(2);
    expect(getWikiTask).toHaveBeenCalledWith("task-1");
    // The poll result keeps the progress UI moving while re-attaching.
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ status: "generating" }),
    );
  });

  it("finishes from the task status when the task completed during the drop", async () => {
    scriptStream((h) => h.onError(new Error("disconnected")));
    getWikiTask.mockResolvedValue(completed);

    const knowledge = await settle(
      new DeepWikiKnowledgeEngine().generate(snapshot),
    );

    expect(knowledge.pages).toHaveLength(2);
    expect(streamWikiTask).toHaveBeenCalledTimes(1);
  });

  it("falls back to the wiki cache when the task was evicted during the drop", async () => {
    scriptStream((h) => h.onError(new Error("disconnected")));
    getWikiTask.mockRejectedValue(
      new DeepWikiServiceError("DeepWiki request failed: 404", 404),
    );

    const knowledge = await settle(
      new DeepWikiKnowledgeEngine().generate(snapshot),
    );

    expect(knowledge.title).toBe("Acme API");
  });

  it("explains a lost task with no finished wiki instead of claiming success", async () => {
    // What the stream really sends when the registry drops a task mid-way
    // — not a task status, despite the handler's declared type.
    scriptStream((h) =>
      h.onError({
        error: "task no longer available",
      } as unknown as DeepWikiWikiTaskStatus),
    );
    getWikiCache.mockResolvedValue(null);

    await expect(
      settle(new DeepWikiKnowledgeEngine().generate(snapshot)),
    ).rejects.toThrow(/Lost track of DeepWiki's generation task/);
    expect(getWikiTask).not.toHaveBeenCalled();
  });

  it("gives up only after DeepWiki stays unreachable across reconnects", async () => {
    const unsubscribe = scriptStream(
      ...Array.from({ length: 6 }, () => (h: StreamHandlers) => {
        h.onError(new Error("disconnected"));
      }),
    );
    getWikiTask.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      settle(new DeepWikiKnowledgeEngine().generate(snapshot)),
    ).rejects.toThrow(/DeepWiki stopped responding/);
    // Every poll failed, so the stream was never re-subscribed — the
    // retries all went through the cheap status endpoint instead.
    expect(streamWikiTask).toHaveBeenCalledTimes(1);
    expect(getWikiTask).toHaveBeenCalledTimes(5);
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(getWikiCache).not.toHaveBeenCalled();
  });
});
