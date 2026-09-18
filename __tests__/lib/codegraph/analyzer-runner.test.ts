import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzerFailureReason,
  codegraphStoragePrefix,
  inWorkspace,
  mapSearchEntries,
  openExistingAnalysis,
  parseProgress,
  probeSandbox,
} from "#/lib/codegraph/analyzer-runner";
import type { CodeGraphMeta } from "#/lib/codegraph/codegraph-types";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";
import type { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";

const executeCommandMock = vi.fn();
const downloadAsTextMock = vi.fn();

vi.mock("@openhands/typescript-client/workspace/remote-workspace", () => ({
  RemoteWorkspace: vi.fn(function RemoteWorkspaceMock() {
    return {
      executeCommand: executeCommandMock,
      downloadAsText: downloadAsTextMock,
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
});
