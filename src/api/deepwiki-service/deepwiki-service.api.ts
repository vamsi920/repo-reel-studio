import type {
  DeepWikiChatCompletionRequest,
  DeepWikiWikiCacheData,
  DeepWikiWikiTaskRequest,
  DeepWikiWikiTaskStatus,
  DeepWikiWikiTaskSubmitResult,
  DeepWikiWikiTaskSummary,
} from "./deepwiki-service.types";

/**
 * HTTP client for the vendored DeepWiki-Open backend
 * (`vendor/deepwiki-open/api/`), run as its own local process — the same
 * "external sibling Python service reached over HTTP" pattern this app
 * already uses for the agent-server and automation backends. Unlike those,
 * DeepWiki isn't proxied through the backend-registry/cloud-proxy layer: it's
 * a standalone local companion process the user runs themselves (see
 * `docs/deepwiki-video-kt-integration.md` for how to start it), so this
 * client talks to it directly at a configurable base URL.
 */
const DEEPWIKI_SERVICE_URL =
  (import.meta.env.VITE_DEEPWIKI_SERVICE_URL as string | undefined) ??
  "http://localhost:8001";

class DeepWikiServiceError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "DeepWikiServiceError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${DEEPWIKI_SERVICE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new DeepWikiServiceError(
      `DeepWiki request to ${path} failed: ${response.status} ${text}`,
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

/** `/chat/completions/stream` responds with `text/event-stream` but its body
 * is just plain concatenated text chunks (see research.py's respond_stream
 * implementations), not real SSE `data:` framing — so a plain awaited
 * `.text()` correctly collects the whole response for a one-off,
 * non-incremental call like the narrative pass or a repair retry. */
async function requestText(path: string, init?: RequestInit): Promise<string> {
  const response = await fetch(`${DEEPWIKI_SERVICE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new DeepWikiServiceError(
      `DeepWiki request to ${path} failed: ${response.status} ${text}`,
      response.status,
    );
  }
  return response.text();
}

class DeepWikiService {
  /** Submit a repo for index + wiki generation. Get-or-create — safe to call
   * repeatedly for the same repo/commit; DeepWiki joins an active task or
   * returns the cached result instead of duplicating work. */
  static async submitWikiTask(
    request_: DeepWikiWikiTaskRequest,
  ): Promise<DeepWikiWikiTaskSubmitResult> {
    return request<DeepWikiWikiTaskSubmitResult>("/wiki/tasks", {
      method: "POST",
      body: JSON.stringify(request_),
    });
  }

  static async getWikiTask(taskId: string): Promise<DeepWikiWikiTaskStatus> {
    return request<DeepWikiWikiTaskStatus>(
      `/wiki/tasks/${encodeURIComponent(taskId)}`,
    );
  }

  static async listWikiTasks(
    status?: "active" | "completed",
  ): Promise<DeepWikiWikiTaskSummary[]> {
    const query = status ? `?status=${status}` : "";
    return request<DeepWikiWikiTaskSummary[]>(`/wiki/tasks${query}`);
  }

  /**
   * Streams task progress via Server-Sent Events until a terminal
   * `completed`/`failed` status. Returns an unsubscribe function.
   */
  static streamWikiTask(
    taskId: string,
    handlers: {
      onProgress: (status: DeepWikiWikiTaskStatus) => void;
      onDone: (status: DeepWikiWikiTaskStatus) => void;
      onError: (status: DeepWikiWikiTaskStatus | Error) => void;
    },
  ): () => void {
    const source = new EventSource(
      `${DEEPWIKI_SERVICE_URL}/wiki/tasks/${encodeURIComponent(taskId)}/stream`,
    );

    source.addEventListener("progress", (event) => {
      handlers.onProgress(JSON.parse((event as MessageEvent).data));
    });
    source.addEventListener("done", (event) => {
      handlers.onDone(JSON.parse((event as MessageEvent).data));
      source.close();
    });
    source.addEventListener("error", (event) => {
      const messageEvent = event as MessageEvent;
      if (messageEvent.data) {
        handlers.onError(JSON.parse(messageEvent.data));
      } else {
        handlers.onError(new Error("DeepWiki progress stream disconnected"));
      }
      source.close();
    });

    return () => source.close();
  }

  static async getWikiCache(
    owner: string,
    repo: string,
    repoType: string,
    language = "en",
    commitSha?: string,
  ): Promise<DeepWikiWikiCacheData | null> {
    const query = new URLSearchParams({
      owner,
      repo,
      repo_type: repoType,
      language,
      ...(commitSha ? { commit_sha: commitSha } : {}),
    });
    return request<DeepWikiWikiCacheData | null>(`/api/wiki_cache?${query}`);
  }

  /** One-off, non-streamed chat completion against an already-indexed repo —
   * reuses the same DeepWiki/Gemini config Knowledge generation already
   * uses, no new API-key handling. Requires the repo to already be indexed
   * (real for any repo Knowledge has been generated for); throws
   * `DeepWikiServiceError` with status 425 otherwise. */
  static async chatCompletion(
    request_: DeepWikiChatCompletionRequest,
  ): Promise<string> {
    return requestText("/chat/completions/stream", {
      method: "POST",
      body: JSON.stringify(request_),
    });
  }
}

export default DeepWikiService;
export { DeepWikiServiceError };
