import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzerFailureReason,
  codegraphStoragePrefix,
  inWorkspace,
  mapSearchEntries,
  openExistingAnalysis,
  parseProgress,
  probeSandbox,
  runAnalysis,
  CodeGraphAnalyzerError,
  type RunAnalysisOptions,
} from "#/lib/codegraph/analyzer-runner";
import { shardName } from "#/lib/codegraph/shard-name";
import type { CodeGraphMeta } from "#/lib/codegraph/codegraph-types";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";
import type { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";

const executeCommandMock = vi.fn();
const downloadAsTextMock = vi.fn();
const fileUploadMock = vi.fn();
const uploadTextMock = vi.fn();

vi.mock("@openhands/typescript-client/workspace/remote-workspace", () => ({
  RemoteWorkspace: vi.fn(function RemoteWorkspaceMock() {
    return {
      executeCommand: executeCommandMock,
      downloadAsText: downloadAsTextMock,
      fileUpload: fileUploadMock,
      uploadText: uploadTextMock,
    };
  }),
}));

const getSignedUrlMock = vi.fn();

vi.mock("#/lib/data-platform/artifact-store", () => ({
  artifactStore: {
    getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
    put: vi.fn(),
  },
}));

describe("inWorkspace", () => {
  // The agent-server's /api/file/upload and /api/file/download take the path
  // verbatim and reject a relative one with
  // `400 {"detail":"Path must be absolute"}`. The SDK does not prefix
  // workingDir, so every path we hand it has to be built through this.
  it("produces an absolute path under the workspace root", () => {
    expect(inWorkspace("/workspace/project", ".neodevex/codegraph")).toBe(
      "/workspace/project/.neodevex/codegraph",
    );
  });

  it("never returns a relative path", () => {
    expect(inWorkspace("/ws", "a/b.json").startsWith("/")).toBe(true);
  });

  it("does not double up separators", () => {
    expect(inWorkspace("/workspace/project/", "/a/b.json")).toBe(
      "/workspace/project/a/b.json",
    );
  });

  it("resolves a repository-relative source file", () => {
    expect(inWorkspace("/workspace/app", "src/pay/charge.ts")).toBe(
      "/workspace/app/src/pay/charge.ts",
    );
  });
});

describe("parseProgress", () => {
  it("reads the analyzer's JSON-lines milestones off stdout", () => {
    const stdout = [
      '{"__codegraph":"analyzing"}',
      '{"__codegraph":"relationships","fileCount":2550}',
      '{"__codegraph":"mapped","fileCount":2550,"symbolCount":6778}',
      '{"__codegraph":"ready","subsystemCount":13}',
    ].join("\n");

    expect(parseProgress(stdout)).toEqual([
      { phase: "analyzing" },
      { phase: "relationships", fileCount: 2550 },
      { phase: "mapped", fileCount: 2550, symbolCount: 6778 },
      { phase: "ready", subsystemCount: 13 },
    ]);
  });

  it("ignores tree-sitter's own grammar warnings on the same stream", () => {
    const stdout = [
      "tree-sitter: Could not load grammar for ruby, skipping structural analysis",
      '{"__codegraph":"ready","subsystemCount":3}',
      "some other noise",
    ].join("\n");

    expect(parseProgress(stdout)).toEqual([
      { phase: "ready", subsystemCount: 3 },
    ]);
  });

  it("ignores JSON that is not ours", () => {
    expect(parseProgress('{"hello":"world"}')).toEqual([]);
  });

  it("survives a truncated line without losing the rest", () => {
    const stdout = [
      '{"__codegraph":"analy',
      '{"__codegraph":"ready","subsystemCount":1}',
    ].join("\n");

    expect(parseProgress(stdout)).toEqual([
      { phase: "ready", subsystemCount: 1 },
    ]);
  });

  it("carries the failure reason through", () => {
    expect(parseProgress('{"__codegraph":"failed","reason":"ENOENT"}')).toEqual(
      [{ phase: "failed", reason: "ENOENT" }],
    );
  });

  it("returns nothing for empty output", () => {
    expect(parseProgress("")).toEqual([]);
  });
});

describe("analyzerFailureReason", () => {
  it("prefers the analyzer's own failed milestone", () => {
    expect(
      analyzerFailureReason({
        stdout: '{"__codegraph":"failed","reason":"ENOENT: grammars"}',
        stderr: "node: some stack trace",
      }),
    ).toBe("ENOENT: grammars");
  });

  it("falls back to the tail of stderr", () => {
    expect(analyzerFailureReason({ stdout: "", stderr: "  Killed\n" })).toBe(
      "Killed",
    );
  });

  it("never returns an empty reason", () => {
    // `"".slice(-500) ?? fallback` used to yield "" here, and the page then
    // rendered "Graph analysis failed" over a blank line.
    expect(analyzerFailureReason({ stdout: "", stderr: "" })).toBe(
      "analyzer exited non-zero",
    );
    expect(analyzerFailureReason({ stdout: null, stderr: null })).toBe(
      "analyzer exited non-zero",
    );
  });

  it("uses pre-parsed events when given", () => {
    expect(
      analyzerFailureReason({
        events: [{ phase: "failed", reason: "out of memory" }],
        stderr: "ignored",
      }),
    ).toBe("out of memory");
  });
});

describe("mapSearchEntries", () => {
  it("maps compact tuples to entries", () => {
    expect(
      mapSearchEntries([
        ["file:a.ts", "a.ts", "file", "a.ts", "module:src", "unit"],
      ]),
    ).toEqual([
      {
        id: "file:a.ts",
        name: "a.ts",
        type: "file",
        filePath: "a.ts",
        parentId: "module:src",
        level: "unit",
      },
    ]);
  });

  it("returns nothing for a corrupt or missing index instead of throwing", () => {
    // A partially mirrored `search.json` used to throw out of
    // `loadSearchIndex` and leave the search box silently dead.
    expect(mapSearchEntries(null)).toEqual([]);
    expect(mapSearchEntries({ not: "an array" })).toEqual([]);
    expect(mapSearchEntries("garbage")).toEqual([]);
  });

  it("skips malformed rows and fills missing columns", () => {
    expect(
      mapSearchEntries(["not a row", [42, "bad id"], ["sym:x", "x"]]),
    ).toEqual([
      {
        id: "sym:x",
        name: "x",
        type: "",
        filePath: "",
        parentId: "",
        level: "",
      },
    ]);
  });
});

describe("probeSandbox", () => {
  afterEach(() => {
    executeCommandMock.mockReset();
  });

  function fakeWorkspace(): RemoteWorkspace {
    return { executeCommand: executeCommandMock } as unknown as RemoteWorkspace;
  }

  it("accepts a sandbox with a recent enough Node", async () => {
    executeCommandMock.mockResolvedValue({
      exit_code: 0,
      stdout: "v20.11.0\n",
    });

    expect(await probeSandbox(fakeWorkspace())).toEqual({
      ok: true,
      nodeVersion: "v20.11.0",
    });
  });

  it("rejects a Node older than 18 — the analyzer payload needs it", async () => {
    executeCommandMock.mockResolvedValue({ exit_code: 0, stdout: "v16.20.0" });

    expect(await probeSandbox(fakeWorkspace())).toEqual({
      ok: false,
      reason: "node v16.20.0 is too old (need 18+)",
    });
  });

  it("rejects a sandbox with no node on PATH before uploading anything", async () => {
    executeCommandMock.mockResolvedValue({
      exit_code: 127,
      stdout: "",
      stderr: "node: command not found",
    });

    expect(await probeSandbox(fakeWorkspace())).toEqual({
      ok: false,
      reason: "node is not available in this workspace",
    });
  });

  it("rejects output that does not look like a node version", async () => {
    executeCommandMock.mockResolvedValue({
      exit_code: 0,
      stdout: "not node at all\n",
    });

    expect(await probeSandbox(fakeWorkspace())).toEqual({
      ok: false,
      reason: "node is not available in this workspace",
    });
  });

  it("reports a thrown error instead of letting it escape", async () => {
    executeCommandMock.mockRejectedValue(new Error("sandbox unreachable"));

    expect(await probeSandbox(fakeWorkspace())).toEqual({
      ok: false,
      reason: "sandbox unreachable",
    });
  });
});

describe("codegraphStoragePrefix", () => {
  it("puts the workspace id first, matching the bucket's RLS path check", () => {
    // uploadArtifactsToStorage's own docstring: "the bucket's RLS checks path
    // segment 1 against is_workspace_member" — swapping this order would be a
    // silent permission bug, not a rendering one, so the exact shape is
    // worth locking in.
    expect(codegraphStoragePrefix("ws-1", "repo-1", "abc123")).toBe(
      "ws-1/codegraph/repo-1/abc123",
    );
  });
});

describe("openExistingAnalysis", () => {
  const SNAPSHOT: RepositorySnapshot = {
    repositoryId: "repo-1",
    owner: "acme",
    repo: "widgets",
    branch: "main",
    commitSha: "abc123",
    localPath: "/workspace/project",
  };

  const META: CodeGraphMeta = {
    workspaceId: "ws-1",
    repositoryId: "repo-uuid",
    commitSha: "abc123",
    generatedAt: "2026-09-18T00:00:00.000Z",
    fileCount: 1,
    symbolCount: 1,
    languages: ["ts"],
    frameworks: [],
  };
  const ROOT = { parentId: null, nodes: [], edges: [], crumbs: [] };

  function baseOptions(
    storageIds: { workspaceId: string; repositoryUuid: string } | null,
  ) {
    return {
      snapshot: SNAPSHOT,
      conversationUrl: "http://localhost:3000",
      sessionApiKey: null,
      workspaceId: "ws-1",
      storageIds,
    };
  }

  afterEach(() => {
    executeCommandMock.mockReset();
    downloadAsTextMock.mockReset();
    getSignedUrlMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("prefers Storage over the sandbox once both artefacts are mirrored", async () => {
    getSignedUrlMock.mockImplementation(
      async (_bucket: string, path: string) => `https://signed.example/${path}`,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (url.endsWith("meta.json") ? META : ROOT),
      })),
    );

    const handle = await openExistingAnalysis(
      baseOptions({ workspaceId: "ws-1", repositoryUuid: "repo-uuid" }),
    );

    expect(handle?.meta).toEqual(META);
    expect(handle?.root).toEqual(ROOT);
    // The whole point of the Storage mirror is skipping the sandbox entirely.
    expect(downloadAsTextMock).not.toHaveBeenCalled();
  });

  it("falls back to the sandbox when Storage has no mirror for this commit", async () => {
    getSignedUrlMock.mockResolvedValue(null);
    downloadAsTextMock.mockImplementation(async (path: string) => {
      if (path.endsWith("meta.json")) return JSON.stringify(META);
      if (path.endsWith("root.json")) return JSON.stringify(ROOT);
      throw new Error(`unexpected path ${path}`);
    });

    const handle = await openExistingAnalysis(
      baseOptions({ workspaceId: "ws-1", repositoryUuid: "repo-uuid" }),
    );

    expect(handle?.meta).toEqual(META);
    expect(handle?.root).toEqual(ROOT);
  });

  it("returns null rather than a graph from a different commit", async () => {
    // No storageIds at all (Supabase unconfigured) and nothing in the
    // sandbox for this commit either — this must not fall back to any other
    // commit's graph.
    downloadAsTextMock.mockRejectedValue(new Error("404"));

    const handle = await openExistingAnalysis(baseOptions(null));

    expect(handle).toBeNull();
  });

  it("the sandbox-backed handle's loadLevel/loadSearchIndex/readSource read shard-encoded absolute paths", async () => {
    downloadAsTextMock.mockImplementation(async (path: string) => {
      if (path.endsWith("meta.json")) return JSON.stringify(META);
      if (path.endsWith("root.json")) return JSON.stringify(ROOT);
      if (
        path === "/workspace/project/.neodevex/codegraph/out/abc123/search.json"
      )
        return JSON.stringify([["a", "A", "file", "a.ts", "", "unit"]]);
      if (path === "/workspace/project/src/a.ts") return "export const a = 1;";
      throw new Error(`unexpected download ${path}`);
    });

    const handle = await openExistingAnalysis(baseOptions(null));
    expect(handle).not.toBeNull();

    const level = await handle!.loadLevel("module:src");
    expect(downloadAsTextMock).toHaveBeenCalledWith(
      `/workspace/project/.neodevex/codegraph/out/abc123/levels/${shardName("module:src")}.json`,
    );
    expect(level).toBeNull(); // no mock response for this shard -> readJson swallows and returns null

    const entries = await handle!.loadSearchIndex();
    expect(entries).toEqual([
      {
        id: "a",
        name: "A",
        type: "file",
        filePath: "a.ts",
        parentId: "",
        level: "unit",
      },
    ]);

    const source = await handle!.readSource("src/a.ts");
    expect(source).toBe("export const a = 1;");

    downloadAsTextMock.mockRejectedValueOnce(new Error("moved"));
    expect(await handle!.readSource("src/gone.ts")).toBeNull();
  });

  it("the Storage-backed handle reads shards/search from Storage but source from a live sandbox", async () => {
    getSignedUrlMock.mockImplementation(
      async (_bucket: string, path: string) => `https://signed.example/${path}`,
    );
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("search.json")) {
        return {
          ok: true,
          json: async () => [["a", "A", "file", "a.ts", "", "unit"]],
        };
      }
      return {
        ok: true,
        json: async () => (url.includes("meta.json") ? META : ROOT),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    downloadAsTextMock.mockResolvedValue("export const a = 1;");

    const handle = await openExistingAnalysis(
      baseOptions({ workspaceId: "ws-1", repositoryUuid: "repo-uuid" }),
    );
    expect(handle).not.toBeNull();

    await handle!.loadSearchIndex();
    expect(getSignedUrlMock).toHaveBeenCalledWith(
      "workspace-artifacts",
      "ws-1/codegraph/repo-uuid/abc123/search.json",
    );

    // Raw source is never mirrored to Storage — this must still hit the
    // sandbox even though everything else came from Storage.
    const source = await handle!.readSource("src/a.ts");
    expect(source).toBe("export const a = 1;");
    expect(downloadAsTextMock).toHaveBeenCalledWith(
      "/workspace/project/src/a.ts",
    );

    downloadAsTextMock.mockRejectedValueOnce(new Error("sandbox gone"));
    expect(await handle!.readSource("src/gone.ts")).toBeNull();
  });
});

describe("runAnalysis", () => {
  const SNAPSHOT: RepositorySnapshot = {
    repositoryId: "repo-1",
    owner: "acme",
    repo: "widgets",
    branch: "main",
    commitSha: "abc123",
    localPath: "/workspace/project",
  };

  const MANIFEST = {
    entry: "analyze.mjs",
    runtime: ["shared/util.mjs"],
    grammars: ["grammars/foo.wasm"],
  };

  const META: CodeGraphMeta = {
    workspaceId: "ws-1",
    repositoryId: "repo-uuid",
    commitSha: "abc123",
    generatedAt: "2026-09-20T00:00:00.000Z",
    fileCount: 1,
    symbolCount: 1,
    languages: ["ts"],
    frameworks: [],
  };
  const ROOT = { parentId: null, nodes: [], edges: [], crumbs: [] };

  function baseOptions(
    overrides: Partial<RunAnalysisOptions> = {},
  ): RunAnalysisOptions {
    return {
      snapshot: SNAPSHOT,
      conversationUrl: "http://localhost:3000",
      sessionApiKey: null,
      workspaceId: "ws-1",
      hints: [],
      storageIds: null,
      ...overrides,
    };
  }

  /** Routes each executeCommand call by content, since two different commands
   * in the flow both start with "mkdir -p". */
  function wireHappyExecuteCommand(
    options: {
      grammarCount?: number;
      analyzeExitCode?: number;
      analyzeStdout?: string;
      analyzeStderr?: string;
    } = {},
  ) {
    const {
      grammarCount = 1,
      analyzeExitCode = 0,
      analyzeStdout = '{"__codegraph":"analyzing"}\n{"__codegraph":"ready","subsystemCount":3}',
      analyzeStderr = "",
    } = options;
    executeCommandMock.mockImplementation(async (command: string) => {
      if (command.startsWith("node --version")) {
        return { exit_code: 0, stdout: "v20.11.0\n" };
      }
      if (command.includes("&& node ")) {
        return {
          exit_code: analyzeExitCode,
          stdout: analyzeStdout,
          stderr: analyzeStderr,
        };
      }
      if (command.startsWith("test -f")) {
        return { exit_code: 0, stdout: `${grammarCount}\n` };
      }
      if (command.startsWith("mkdir -p")) {
        return { exit_code: 0, stdout: "" };
      }
      throw new Error(`unexpected command: ${command}`);
    });
  }

  function wireHappyFetch(overrides: { failFile?: string } = {}) {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/manifest.json")) {
        return { ok: true, json: async () => MANIFEST };
      }
      if (overrides.failFile && url.endsWith(overrides.failFile)) {
        return { ok: false };
      }
      return { ok: true, blob: async () => new Blob(["payload"]) };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    executeCommandMock.mockReset();
    downloadAsTextMock.mockReset();
    fileUploadMock.mockReset();
    uploadTextMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("runs the full flow and returns a handle built from the analyzer's output", async () => {
    wireHappyExecuteCommand();
    wireHappyFetch();
    fileUploadMock.mockResolvedValue({});
    uploadTextMock.mockResolvedValue({});
    downloadAsTextMock.mockImplementation(async (path: string) => {
      if (path.endsWith("meta.json")) return JSON.stringify(META);
      if (path.endsWith("root.json")) return JSON.stringify(ROOT);
      throw new Error(`unexpected download ${path}`);
    });
    const onProgress = vi.fn();

    const handle = await runAnalysis(baseOptions({ onProgress }));

    expect(handle.meta).toEqual(META);
    expect(handle.root).toEqual(ROOT);
    // Every payload file (entry + runtime + grammars) must actually land.
    expect(fileUploadMock).toHaveBeenCalledTimes(3);
    expect(uploadTextMock).toHaveBeenCalledWith(
      "[]",
      "/workspace/project/.neodevex/codegraph/hints.json",
      "hints.json",
    );
    expect(onProgress.mock.calls.map((call) => call[0])).toEqual([
      { phase: "analyzing" },
      { phase: "ready", subsystemCount: 3 },
    ]);
  });

  it("throws a preflight error when the sandbox has no usable node, before uploading anything", async () => {
    executeCommandMock.mockResolvedValue({
      exit_code: 127,
      stdout: "",
      stderr: "node: command not found",
    });
    wireHappyFetch();

    await expect(runAnalysis(baseOptions())).rejects.toMatchObject({
      stage: "preflight",
      message: "node is not available in this workspace",
    });
    expect(fileUploadMock).not.toHaveBeenCalled();
  });

  it("throws a preflight error when the analyzer payload was never built", async () => {
    wireHappyExecuteCommand();
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/manifest.json") ? { ok: false } : { ok: true },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(runAnalysis(baseOptions())).rejects.toMatchObject({
      stage: "preflight",
      message: expect.stringContaining("npm run build:codegraph-analyzer"),
    });
  });

  it("throws an upload error when one of the manifest's assets 404s", async () => {
    wireHappyExecuteCommand();
    wireHappyFetch({ failFile: "grammars/foo.wasm" });

    await expect(runAnalysis(baseOptions())).rejects.toMatchObject({
      stage: "upload",
      message: expect.stringContaining("grammars/foo.wasm"),
    });
  });

  it("throws an analysis error carrying the analyzer's own failure reason on a non-zero exit", async () => {
    wireHappyExecuteCommand({
      analyzeExitCode: 1,
      analyzeStdout: '{"__codegraph":"failed","reason":"ENOENT: grammars"}',
      analyzeStderr: "node: stack trace",
    });
    wireHappyFetch();
    fileUploadMock.mockResolvedValue({});
    uploadTextMock.mockResolvedValue({});

    await expect(runAnalysis(baseOptions())).rejects.toMatchObject({
      stage: "analysis",
      message: "ENOENT: grammars",
    });
  });

  it("throws when the analyzer exits clean but leaves no readable meta/root", async () => {
    wireHappyExecuteCommand();
    wireHappyFetch();
    fileUploadMock.mockResolvedValue({});
    uploadTextMock.mockResolvedValue({});
    downloadAsTextMock.mockRejectedValue(new Error("ENOENT"));

    await expect(runAnalysis(baseOptions())).rejects.toMatchObject({
      stage: "analysis",
      message: "analyzer finished but produced no readable graph",
    });
  });

  it("mirrors output to Storage under the real workspace/repository ids when storageIds resolve, and still succeeds if mirroring fails", async () => {
    wireHappyExecuteCommand();
    wireHappyFetch();
    fileUploadMock.mockResolvedValue({});
    uploadTextMock.mockResolvedValue({});
    downloadAsTextMock.mockImplementation(async (path: string) => {
      if (path.endsWith("meta.json")) return JSON.stringify(META);
      if (path.endsWith("root.json")) return JSON.stringify(ROOT);
      // The post-analysis `find` listing for the Storage mirror step.
      throw new Error("no files to mirror");
    });
    executeCommandMock.mockImplementation(async (command: string) => {
      if (command.startsWith("node --version")) {
        return { exit_code: 0, stdout: "v20.11.0\n" };
      }
      if (command.includes("&& node ")) {
        return {
          exit_code: 0,
          stdout: '{"__codegraph":"ready","subsystemCount":1}',
        };
      }
      if (command.startsWith("test -f")) return { exit_code: 0, stdout: "1\n" };
      if (command.startsWith("mkdir -p")) return { exit_code: 0, stdout: "" };
      if (command.startsWith("find "))
        return { exit_code: 1, stdout: "", stderr: "" };
      throw new Error(`unexpected command: ${command}`);
    });

    // A failed mirror must not fail the run — it's a best-effort optimization.
    const handle = await runAnalysis(
      baseOptions({
        storageIds: { workspaceId: "ws-1", repositoryUuid: "repo-uuid" },
      }),
    );

    expect(handle.meta).toEqual(META);
  });
});

describe("CodeGraphAnalyzerError", () => {
  it("carries the stage alongside a normal Error message", () => {
    const error = new CodeGraphAnalyzerError("upload", "boom");
    expect(error).toBeInstanceOf(Error);
    expect(error.stage).toBe("upload");
    expect(error.message).toBe("boom");
    expect(error.name).toBe("CodeGraphAnalyzerError");
  });
});
