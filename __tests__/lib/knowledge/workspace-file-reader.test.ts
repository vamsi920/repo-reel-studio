import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RepositorySnapshot } from "#/lib/knowledge/knowledge-engine";

const downloadAsText = vi.fn();
vi.mock("@openhands/typescript-client/workspace/remote-workspace", () => ({
  RemoteWorkspace: vi.fn(function RemoteWorkspaceMock() {
    return { downloadAsText };
  }),
}));

vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: () => ({
    host: "http://localhost:18000",
    apiKey: "session-key",
  }),
}));

const { readSnapshotFiles } =
  await import("#/lib/knowledge/workspace-file-reader");

const snapshot: RepositorySnapshot = {
  repositoryId: "acme/api@main",
  owner: "acme",
  repo: "api",
  branch: "main",
  commitSha: "abc123",
  localPath: "/workspace/acme-api",
};

describe("readSnapshotFiles", () => {
  beforeEach(() => {
    downloadAsText.mockReset();
    vi.mocked(RemoteWorkspace).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("anchors every path to the workspace root and returns content keyed by the repo-relative path", async () => {
    downloadAsText.mockImplementation(
      async (path: string) => `content of ${path}`,
    );

    const result = await readSnapshotFiles(
      snapshot,
      "https://conversation.example",
      "session-key",
      ["src/index.ts", "README.md"],
    );

    expect(downloadAsText).toHaveBeenCalledWith(
      "/workspace/acme-api/src/index.ts",
    );
    expect(downloadAsText).toHaveBeenCalledWith(
      "/workspace/acme-api/README.md",
    );
    expect(result.contents).toEqual({
      "src/index.ts": "content of /workspace/acme-api/src/index.ts",
      "README.md": "content of /workspace/acme-api/README.md",
    });
    expect(result.failedPaths).toEqual([]);
  });

  it("records a failed download separately instead of dropping it silently", async () => {
    downloadAsText.mockImplementation(async (path: string) => {
      if (path.endsWith("missing.ts")) throw new Error("404");
      return "ok";
    });

    const result = await readSnapshotFiles(
      snapshot,
      "https://conversation.example",
      "session-key",
      ["src/present.ts", "src/missing.ts"],
    );

    expect(result.contents).toEqual({ "src/present.ts": "ok" });
    expect(result.failedPaths).toEqual(["src/missing.ts"]);
  });

  it("returns every path as failed when every download fails, without throwing", async () => {
    downloadAsText.mockRejectedValue(new Error("network error"));

    const result = await readSnapshotFiles(
      snapshot,
      "https://conversation.example",
      "session-key",
      ["a.ts", "b.ts"],
    );

    expect(result.contents).toEqual({});
    expect(result.failedPaths).toEqual(["a.ts", "b.ts"]);
  });

  it("resolves to empty contents and no failures for an empty path list", async () => {
    const result = await readSnapshotFiles(
      snapshot,
      "https://conversation.example",
      "session-key",
      [],
    );

    expect(result).toEqual({ contents: {}, failedPaths: [] });
    expect(downloadAsText).not.toHaveBeenCalled();
  });
});
