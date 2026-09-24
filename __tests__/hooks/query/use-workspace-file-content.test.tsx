import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useWorkspaceFileBinaryTextSniff,
  useWorkspaceFileContent,
  WorkspaceFileReadError,
} from "#/hooks/query/use-workspace-file-content";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";

const useWorkspaceSessionMock = vi.fn();
vi.mock("#/hooks/query/use-workspace-session", async (importOriginal) => {
  const real =
    await importOriginal<
      typeof import("#/hooks/query/use-workspace-session")
    >();
  return {
    ...real,
    // Keep the real joinWorkspaceUrl so we assert against URLs assembled
    // by the hook the same way the production code assembles them.
    useWorkspaceSession: () => useWorkspaceSessionMock(),
  };
});

const useActiveConversationMock = vi.fn();
vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

const useRuntimeIsReadyMock = vi.fn();
vi.mock("#/hooks/use-runtime-is-ready", () => ({
  useRuntimeIsReady: (options?: unknown) => useRuntimeIsReadyMock(options),
}));

const getActiveBackendMock = vi.fn();
vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: () => getActiveBackendMock(),
}));

const downloadFileMock = vi.fn();
vi.mock("#/api/runtime-service/agent-server-runtime-service", () => ({
  default: {
    downloadFile: (...args: unknown[]) => downloadFileMock(...args),
  },
}));

const readCloudConversationFileMock = vi.fn();
vi.mock("#/api/cloud/conversation-service.api", () => ({
  readCloudConversationFile: (...args: unknown[]) =>
    readCloudConversationFileMock(...args),
}));

const fetchMock = vi.fn();

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = function WorkspaceFileContentTestWrapper({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
  return Wrapper;
}

const BASE_URL =
  "https://agent.example.com/api/conversations/conv-1/workspace/";

describe("useWorkspaceFileContent", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    useWorkspaceSessionMock.mockReset();
    useActiveConversationMock.mockReset();
    useRuntimeIsReadyMock.mockReset();
    getActiveBackendMock.mockReset();
    downloadFileMock.mockReset();
    readCloudConversationFileMock.mockReset();
    useRuntimeIsReadyMock.mockReturnValue(true);
    useActiveConversationMock.mockReturnValue({
      data: {
        id: "conv-1",
        conversation_url: "https://agent.example.com/api/conversations/conv-1",
        session_api_key: "session-key",
      },
    });
    useWorkspaceSessionMock.mockReturnValue({
      data: { baseUrl: BASE_URL },
      isLoading: false,
      isError: false,
      error: null,
    });
    getActiveBackendMock.mockReturnValue({
      backend: { id: "local-1", kind: "local", host: "http://localhost:8000" },
      orgId: null,
    });
    useWorkspaceMutationCounter.setState({ count: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function arrayBufferFromString(value: string): ArrayBuffer {
    return new TextEncoder().encode(value).buffer as ArrayBuffer;
  }

  it("returns a static URL on the workspace fileserver for text content", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(arrayBufferFromString("# Hello")),
    });

    const { result } = renderHook(
      () => useWorkspaceFileContent("docs/readme.md"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}docs/readme.md`,
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result.current.data).toEqual({
      path: "docs/readme.md",
      kind: "text",
      text: "# Hello",
      staticUrl: `${BASE_URL}docs/readme.md`,
      mimeType: "text/markdown",
    });
  });

  it("keeps reading file content when the agent errored, since the sandbox itself is still up", () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(arrayBufferFromString("hi")),
    });

    renderHook(() => useWorkspaceFileContent("docs/readme.md"), {
      wrapper: makeWrapper(),
    });

    expect(useRuntimeIsReadyMock).toHaveBeenCalledWith({
      allowAgentError: true,
    });
  });

  it("bypasses the browser HTTP cache so a refetch always reaches the server", async () => {
    // The fileserver sends no cache-control/etag, so with the default cache
    // mode Chrome's heuristic freshness would serve a refetch (after an
    // agent edit or the Refresh button) from cache and the viewer would
    // keep stale bytes — or the body of a file that no longer exists.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(arrayBufferFromString("v1")),
    });

    const { result } = renderHook(
      () => useWorkspaceFileContent("notes/alpha.txt"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}notes/alpha.txt`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("does not fetch image bytes — image staticUrl is rendered directly", async () => {
    const { result } = renderHook(
      () => useWorkspaceFileContent("assets/logo.png"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({
      path: "assets/logo.png",
      kind: "image",
      text: null,
      staticUrl: `${BASE_URL}assets/logo.png`,
      mimeType: "image/png",
    });
  });

  it("does not fetch PDF bytes — PDF staticUrl is rendered directly", async () => {
    const { result } = renderHook(() => useWorkspaceFileContent("report.pdf"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({
      path: "report.pdf",
      kind: "pdf",
      text: null,
      staticUrl: `${BASE_URL}report.pdf`,
      mimeType: "application/pdf",
    });
  });

  it("useWorkspaceFileBinaryTextSniff: does not fetch when disabled", async () => {
    const { result } = renderHook(
      () =>
        useWorkspaceFileBinaryTextSniff(
          "assets/logo.png",
          `${BASE_URL}assets/logo.png`,
          false,
          0,
        ),
      { wrapper: makeWrapper() },
    );

    // React Query never runs the queryFn for a disabled query; give it a
    // tick and confirm nothing fired.
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("useWorkspaceFileBinaryTextSniff: decodes text bytes hiding behind an image extension", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () =>
        Promise.resolve(
          arrayBufferFromString("this is plain text, not an image"),
        ),
    });

    const { result } = renderHook(
      () =>
        useWorkspaceFileBinaryTextSniff(
          "fake.png",
          `${BASE_URL}fake.png`,
          true,
          0,
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}fake.png`,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(result.current.data).toEqual({
      text: "this is plain text, not an image",
    });
  });

  it("useWorkspaceFileBinaryTextSniff: refetches after an agent-side edit even though relativePath/staticUrl are unchanged", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () =>
        Promise.resolve(arrayBufferFromString("pre-edit text content")),
    });

    const { result, rerender } = renderHook(
      ({ mutationCount }) =>
        useWorkspaceFileBinaryTextSniff(
          "fake.png",
          `${BASE_URL}fake.png`,
          true,
          mutationCount,
        ),
      { wrapper: makeWrapper(), initialProps: { mutationCount: 0 } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ text: "pre-edit text content" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The agent overwrites the same path in place — staticUrl and
    // relativePath don't change, only the workspace mutation counter does.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () =>
        Promise.resolve(arrayBufferFromString("post-edit text content")),
    });
    rerender({ mutationCount: 1 });

    await waitFor(() =>
      expect(result.current.data).toEqual({ text: "post-edit text content" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("useWorkspaceFileBinaryTextSniff: leaves genuinely binary bytes as null", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () =>
        Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]).buffer),
    });

    const { result } = renderHook(
      () =>
        useWorkspaceFileBinaryTextSniff(
          "real.png",
          `${BASE_URL}real.png`,
          true,
          0,
        ),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ text: null });
  });

  it("useWorkspaceFileBinaryTextSniff: decodes a cloud data-URI staticUrl without a network fetch", async () => {
    const text = "hello from a cloud data URI";
    const dataUrl = `data:image/png;base64,${btoa(text)}`;

    const { result } = renderHook(
      () => useWorkspaceFileBinaryTextSniff("fake.png", dataUrl, true, 0),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ text });
  });

  it("flips text → binary when the fetched bytes contain a NUL", async () => {
    const binary = new Uint8Array([0x01, 0x00, 0x02]).buffer;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(binary),
    });

    const { result } = renderHook(
      () => useWorkspaceFileContent("data/blob.bin"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      kind: "binary",
      text: null,
      mimeType: "application/octet-stream",
      staticUrl: `${BASE_URL}data/blob.bin`,
    });
  });

  it("refetches text content after a workspace mutation tick", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(arrayBufferFromString("first")),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(arrayBufferFromString("second")),
      });

    const { result } = renderHook(
      () => useWorkspaceFileContent("docs/readme.md"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.data?.text).toBe("first"));

    act(() => {
      useWorkspaceMutationCounter.getState().bump();
    });

    await waitFor(() => expect(result.current.data?.text).toBe("second"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not start a file request before a path is selected", async () => {
    renderHook(() => useWorkspaceFileContent(null), { wrapper: makeWrapper() });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not start a file request before the workspace session is minted", async () => {
    useWorkspaceSessionMock.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
    });

    renderHook(() => useWorkspaceFileContent("docs/readme.md"), {
      wrapper: makeWrapper(),
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a non-OK response as an error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    const { result } = renderHook(
      () => useWorkspaceFileContent("missing.txt"),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    // A typed error: the UI reads `status` and never renders the message.
    expect(result.current.error).toBeInstanceOf(WorkspaceFileReadError);
    expect(result.current.error).toEqual(
      expect.objectContaining({
        message: "Failed to read missing.txt: 404",
        status: 404,
        path: "missing.txt",
      }),
    );
  });

  describe("cloud backend", () => {
    beforeEach(() => {
      getActiveBackendMock.mockReturnValue({
        backend: {
          id: "cloud-1",
          kind: "cloud",
          host: "https://app.all-hands.dev",
        },
        orgId: "org-1",
      });
      // useWorkspaceSession self-disables on cloud — its data is null.
      useWorkspaceSessionMock.mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
      });
    });

    it("fetches text via the cloud file endpoint and exposes a data: URI staticUrl", async () => {
      readCloudConversationFileMock.mockResolvedValue("# Hello");

      const { result } = renderHook(
        () => useWorkspaceFileContent("docs/readme.md"),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Cloud uses the first-class cloud API endpoint, never the removed
      // cloud-proxy / downloadFile path, and passes an ABSOLUTE path (the
      // runtime's /api/file/download rejects relative paths).
      expect(readCloudConversationFileMock).toHaveBeenCalledWith(
        "conv-1",
        "/workspace/project/docs/readme.md",
      );
      expect(downloadFileMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.data).toEqual({
        path: "docs/readme.md",
        kind: "text",
        text: "# Hello",
        staticUrl: `data:text/markdown;charset=utf-8;base64,${btoa("# Hello")}`,
        mimeType: "text/markdown",
      });
    });

    it("anchors the file path to the conversation's working dir", async () => {
      useActiveConversationMock.mockReturnValue({
        data: {
          id: "conv-1",
          conversation_url:
            "https://agent.example.com/api/conversations/conv-1",
          session_api_key: "session-key",
          workspace: { working_dir: "/workspace/project/my-repo" },
        },
      });
      readCloudConversationFileMock.mockResolvedValue("hi");

      const { result } = renderHook(
        () => useWorkspaceFileContent("src/index.ts"),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(readCloudConversationFileMock).toHaveBeenCalledWith(
        "conv-1",
        "/workspace/project/my-repo/src/index.ts",
      );
    });

    it("renders images via base64 data URI from the cloud file endpoint", async () => {
      // The cloud endpoint returns text; use an SVG (text-based image) since
      // binary bytes can't round-trip faithfully through the string API.
      const svg = "<svg></svg>";
      readCloudConversationFileMock.mockResolvedValue(svg);

      const { result } = renderHook(
        () => useWorkspaceFileContent("assets/logo.svg"),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(downloadFileMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.data).toEqual({
        path: "assets/logo.svg",
        kind: "image",
        text: null,
        staticUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
        mimeType: "image/svg+xml",
      });
    });

    it("normalizes a cloud 404 into a WorkspaceFileReadError so the files-tab 'file was deleted' fallback can key off it", async () => {
      // Same shape @openhands/typescript-client's HttpError has: an Error
      // subclass named "HttpError" carrying a numeric `status`.
      const httpError = new Error("Not Found");
      httpError.name = "HttpError";
      (httpError as unknown as { status: number }).status = 404;
      readCloudConversationFileMock.mockRejectedValue(httpError);

      const { result } = renderHook(
        () => useWorkspaceFileContent("docs/deleted.md"),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeInstanceOf(WorkspaceFileReadError);
      expect(result.current.error).toEqual(
        expect.objectContaining({
          status: 404,
          path: "docs/deleted.md",
        }),
      );
    });

    it("passes through a non-HTTP cloud failure unchanged", async () => {
      const networkError = new Error("network down");
      readCloudConversationFileMock.mockRejectedValue(networkError);

      const { result } = renderHook(
        () => useWorkspaceFileContent("docs/x.md"),
        { wrapper: makeWrapper() },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(networkError);
      expect(result.current.error).not.toBeInstanceOf(WorkspaceFileReadError);
    });
  });
});
