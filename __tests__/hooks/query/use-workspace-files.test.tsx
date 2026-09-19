import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import {
  MAX_FILES,
  parseListingOutput,
  useWorkspaceFiles,
} from "#/hooks/query/use-workspace-files";
import type { GitChange } from "#/api/open-hands.types";

const useActiveBackendMock = vi.fn();
vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));

const useActiveConversationMock = vi.fn();
vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => useActiveConversationMock(),
}));

const useRuntimeIsReadyMock = vi.fn();
vi.mock("#/hooks/use-runtime-is-ready", () => ({
  useRuntimeIsReady: (options?: unknown) => useRuntimeIsReadyMock(options),
}));

const useUnifiedGetGitChangesMock = vi.fn();
vi.mock("#/hooks/query/use-unified-get-git-changes", () => ({
  useUnifiedGetGitChanges: () => useUnifiedGetGitChangesMock(),
}));

const executeCommandSpy = vi.spyOn(AgentServerRuntimeService, "executeCommand");

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function WorkspaceFilesTestWrapper({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const conversation = {
  id: "conv-1",
  conversation_url: "https://runtime.example.com/api/conversations/conv-1",
  session_api_key: "session-key",
  workspace: { working_dir: "/workspace/project" },
};

function gitChangesResult(data: GitChange[], isLoading = false) {
  return {
    data,
    isLoading,
    isFetching: false,
    isSuccess: true,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
}

beforeEach(() => {
  useActiveBackendMock.mockReset();
  useActiveConversationMock.mockReset();
  useRuntimeIsReadyMock.mockReset();
  useUnifiedGetGitChangesMock.mockReset();
  executeCommandSpy.mockReset();

  useRuntimeIsReadyMock.mockReturnValue(true);
  useActiveConversationMock.mockReturnValue({ data: conversation });
  useUnifiedGetGitChangesMock.mockReturnValue(gitChangesResult([]));
});

afterEach(() => {
  vi.clearAllMocks();
});

const makeBackend = (kind: "local" | "cloud") => ({
  backend: {
    id: "backend-id",
    name: kind === "local" ? "Local" : "Production",
    host:
      kind === "local" ? "http://127.0.0.1:8000" : "https://app.all-hands.dev",
    apiKey: "test-key",
    kind,
  },
  orgId: null,
});

describe("useWorkspaceFiles — local backend", () => {
  beforeEach(() => useActiveBackendMock.mockReturnValue(makeBackend("local")));

  it("lists files via bash find and does not touch git changes", async () => {
    executeCommandSpy.mockResolvedValue({
      exit_code: 0,
      stdout: "./hello.txt\n./src/index.ts\n",
      stderr: "",
    });

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() =>
      expect(result.current.data).toEqual(["hello.txt", "src/index.ts"]),
    );
    expect(executeCommandSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isTruncated).toBe(false);
    expect(result.current.totalCount).toBe(2);
  });

  it("keeps listing files when the agent errored, since the sandbox itself is still up", () => {
    executeCommandSpy.mockResolvedValue({ exit_code: 0, stdout: "", stderr: "" });

    renderHook(() => useWorkspaceFiles(), { wrapper: makeWrapper() });

    expect(useRuntimeIsReadyMock).toHaveBeenCalledWith({
      allowAgentError: true,
    });
  });

  it("orders the listing by depth before cutting it, so a big folder can't hide root files", async () => {
    executeCommandSpy.mockResolvedValue({
      exit_code: 0,
      stdout: "",
      stderr: "",
    });
    renderHook(() => useWorkspaceFiles(), { wrapper: makeWrapper() });
    await waitFor(() => expect(executeCommandSpy).toHaveBeenCalledTimes(1));
    const listCommand = executeCommandSpy.mock.calls[0][2];

    // Depth prefix → numeric sort on it → strip it → cap + total marker.
    expect(listCommand).toMatch(/awk -F\/ '\{ print NF " " \$0 \}'/);
    expect(listCommand).toContain("LC_ALL=C sort -k1,1n -k2");
    expect(listCommand).toContain("cut -d ' ' -f2-");
    expect(listCommand).toContain(`awk -v max=${MAX_FILES}`);
    expect(listCommand).toContain('print "__NEO_TOTAL__ " NR');
    // The old lexicographic cut is gone.
    expect(listCommand).not.toContain("| sort | head");
  });

  it("flags a capped listing as truncated with the workspace's real total", async () => {
    executeCommandSpy.mockResolvedValue({
      exit_code: 0,
      stdout: "./zz-last.txt\n./many/f0001.txt\n__NEO_TOTAL__ 2113\n",
      stderr: "",
    });

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() =>
      expect(result.current.data).toEqual(["zz-last.txt", "many/f0001.txt"]),
    );
    expect(result.current.isTruncated).toBe(true);
    expect(result.current.totalCount).toBe(2113);
  });

  it("reports isLoading while disabled and waiting on the runtime, not a silent empty list", () => {
    // Before `useRuntimeIsReady` resolves true the underlying query is
    // disabled — it has never fetched, so react-query's own `isLoading`
    // (which requires an in-flight fetch) stays false even though there is
    // no data yet. The hook must still report `isLoading: true` here so the
    // Files tab shows its loading state instead of flashing "no files".
    useRuntimeIsReadyMock.mockReturnValue(false);
    executeCommandSpy.mockResolvedValue({ exit_code: 0, stdout: "", stderr: "" });

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(executeCommandSpy).not.toHaveBeenCalled();
  });

  it("reports isError (no data) when find fails, and refetch re-runs the listing", async () => {
    executeCommandSpy.mockResolvedValueOnce({
      exit_code: 1,
      stdout: "",
      stderr: "boom",
    });

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);

    executeCommandSpy.mockResolvedValueOnce({
      exit_code: 0,
      stdout: "./hello.txt\n",
      stderr: "",
    });
    result.current.refetch();

    await waitFor(() => expect(result.current.data).toEqual(["hello.txt"]));
    expect(result.current.isError).toBe(false);
    expect(executeCommandSpy).toHaveBeenCalledTimes(2);
  });
});

describe("useWorkspaceFiles — cloud backend", () => {
  beforeEach(() => useActiveBackendMock.mockReturnValue(makeBackend("cloud")));

  it("derives the file list from git changes without running bash", async () => {
    useUnifiedGetGitChangesMock.mockReturnValue(
      gitChangesResult([
        { status: "A", path: "hello.txt" },
        { status: "M", path: "src/index.ts" },
      ]),
    );

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() =>
      expect(result.current.data).toEqual(["hello.txt", "src/index.ts"]),
    );
    // Cloud must never drive the removed bash/cloud-proxy path.
    expect(executeCommandSpy).not.toHaveBeenCalled();
  });

  it("drops deleted files (they can't be opened) and de-dupes", async () => {
    useUnifiedGetGitChangesMock.mockReturnValue(
      gitChangesResult([
        { status: "A", path: "hello.txt" },
        { status: "D", path: "gone.txt" },
        { status: "M", path: "hello.txt" },
      ]),
    );

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual(["hello.txt"]));
  });

  it("surfaces a failed git-changes request as isError with no data", async () => {
    const refetch = vi.fn();
    useUnifiedGetGitChangesMock.mockReturnValue({
      ...gitChangesResult([]),
      isSuccess: false,
      isError: true,
      error: new Error("boom"),
      refetch,
    });

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toBeUndefined();
    result.current.refetch();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous list when a git-changes refresh fails", async () => {
    useUnifiedGetGitChangesMock.mockReturnValue({
      ...gitChangesResult([{ status: "A", path: "hello.txt" }]),
      isSuccess: false,
      isError: true,
      error: new Error("boom"),
    });

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.data).toEqual(["hello.txt"]);
  });

  it("caps a huge change set at MAX_FILES and reports it as truncated", async () => {
    useUnifiedGetGitChangesMock.mockReturnValue(
      gitChangesResult(
        Array.from({ length: MAX_FILES + 5 }, (_, i) => ({
          status: "A" as const,
          path: `many/f${i}.txt`,
        })),
      ),
    );

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.data).toHaveLength(MAX_FILES);
    expect(result.current.isTruncated).toBe(true);
    expect(result.current.totalCount).toBe(MAX_FILES + 5);
  });

  it("surfaces the git-changes loading state", async () => {
    useUnifiedGetGitChangesMock.mockReturnValue(gitChangesResult([], true));

    const { result } = renderHook(() => useWorkspaceFiles(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(executeCommandSpy).not.toHaveBeenCalled();
  });
});

describe("parseListingOutput", () => {
  it("separates the paths from the trailing total marker", () => {
    expect(parseListingOutput("./a.txt\n./b/c.txt\n__NEO_TOTAL__ 2\n")).toEqual(
      { paths: ["a.txt", "b/c.txt"], total: 2 },
    );
  });

  it("reports the real total when the command cut the listing", () => {
    const stdout = `${Array.from(
      { length: MAX_FILES },
      (_, i) => `./many/f${i}.txt`,
    ).join("\n")}\n__NEO_TOTAL__ ${MAX_FILES + 100}\n`;
    const listing = parseListingOutput(stdout);
    expect(listing.paths).toHaveLength(MAX_FILES);
    expect(listing.total).toBe(MAX_FILES + 100);
  });

  it("counts what it has when the marker is missing or unreadable", () => {
    expect(parseListingOutput("./a.txt\n./a.txt\n./b.txt\n")).toEqual({
      paths: ["a.txt", "b.txt"],
      total: 2,
    });
    expect(parseListingOutput("./a.txt\n__NEO_TOTAL__ nope\n")).toEqual({
      paths: ["a.txt"],
      total: 1,
    });
    expect(parseListingOutput("")).toEqual({ paths: [], total: 0 });
  });

  it("never reports fewer files than it lists", () => {
    expect(parseListingOutput("./a.txt\n./b.txt\n__NEO_TOTAL__ 1\n")).toEqual({
      paths: ["a.txt", "b.txt"],
      total: 2,
    });
  });
});
