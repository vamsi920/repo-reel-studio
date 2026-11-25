// @spec RAG-003 — ingest: build documents, batch, prune on full re-sync
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  IngestDocumentPayload,
  RagSource,
} from "#/api/rag/rag-service.api";
import {
  resetWorkspaceMemoryStorage,
  writeRecords,
} from "#/api/workspace-memory/workspace-memory-store.api";
import { batchDocuments, buildSource, syncSource } from "#/services/rag-sync";

const ragService = vi.hoisted(() => ({
  markSourceSyncing: vi.fn(),
  ingest: vi.fn(),
  finishSync: vi.fn(),
  fetchUrl: vi.fn(),
  githubFiles: vi.fn(),
}));

vi.mock("#/api/rag/rag-service.api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  RagService: ragService,
}));

const SOURCE: RagSource = {
  id: "src-1",
  collection_id: "col-1",
  org_id: "org-1",
  kind: "github",
  name: "acme/api",
  config: { repository: "acme/api" },
  status: "ready",
  error: null,
  document_count: 0,
  chunk_count: 0,
  last_synced_at: null,
  created_at: "2026-11-25T00:00:00Z",
};

function doc(id: string, chunks: number): IngestDocumentPayload {
  return {
    external_id: id,
    title: id,
    version_hash: id,
    chunks: Array.from({ length: chunks }, (_, i) => ({
      content: `c${i}`,
      heading_path: "",
      tokens: 1,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkspaceMemoryStorage();
  ragService.ingest.mockResolvedValue({ written: 1, skipped: 0, chunks: 1 });
  ragService.finishSync.mockResolvedValue({
    removed: 1,
    documents: 2,
    chunks: 9,
  });
});

describe("buildSource", () => {
  it("indexes a repository file by file with links, and redacts secrets before upload", async () => {
    ragService.githubFiles.mockResolvedValue({
      repository: "acme/api",
      ref: null,
      skipped: 0,
      private_access: false,
      files: [
        {
          path: "README.md",
          sha: "s1",
          content: "# API\n\nSet token=sk-abcdefghijklmnopqrstu to call it.",
        },
        {
          path: "src/app.ts",
          sha: "s2",
          content:
            "export function start() {\n  return 'listening on 3000';\n}\n",
        },
      ],
    });

    const built = await buildSource({ kind: "github", repository: "acme/api" });

    expect(built.complete).toBe(true);
    expect(built.documents.map((d) => d.uri)).toEqual([
      "https://github.com/acme/api/blob/HEAD/README.md",
      "https://github.com/acme/api/blob/HEAD/src/app.ts",
    ]);
    expect(JSON.stringify(built.documents)).not.toContain("sk-abcdef");
    expect(built.redacted).toBe(1);
    expect(built.documents[1].chunks[0].heading_path).toMatch(
      /^src\/app\.ts:1-/,
    );
  });

  it("turns active workspace memory into one document per record", async () => {
    writeRecords("ws-1", [
      {
        id: "r1",
        workspaceId: "ws-1",
        kind: "decision",
        subject: "money",
        statement: "Prices are integer cents.",
        tags: [],
        provenance: {
          source: "user-decision",
          sourceId: "x",
          observedAt: "2026-11-24T00:00:00Z",
        },
        status: "active",
        confidence: 0.9,
        createdAt: "2026-11-24T00:00:00Z",
        supersededAt: null,
        supersededById: null,
        conflictsWith: [],
        pinned: false,
        tokenCost: 5,
      },
      {
        id: "r2",
        workspaceId: "ws-1",
        kind: "decision",
        subject: "money",
        statement: "Prices are floats.",
        tags: [],
        provenance: {
          source: "user-decision",
          sourceId: "x",
          observedAt: "2026-11-01T00:00:00Z",
        },
        status: "superseded",
        confidence: 0.9,
        createdAt: "2026-11-01T00:00:00Z",
        supersededAt: "2026-11-24T00:00:00Z",
        supersededById: "r1",
        conflictsWith: [],
        pinned: false,
        tokenCost: 5,
      },
    ] as never);

    const built = await buildSource({
      kind: "memory",
      workspaceId: "ws-1",
      label: "shop",
    });

    expect(built.documents.map((d) => d.external_id)).toEqual(["r1"]);
    expect(built.documents[0].chunks[0].content).toContain(
      "Prices are integer cents.",
    );
  });
});

describe("syncSource", () => {
  it("sends batches of at most 200 chunks and prunes documents missing from a complete listing", async () => {
    expect(
      batchDocuments([doc("a", 150), doc("b", 100), doc("c", 10)]).map((b) =>
        b.map((d) => d.external_id),
      ),
    ).toEqual([["a"], ["b", "c"]]);
    ragService.githubFiles.mockResolvedValue({
      repository: "acme/api",
      ref: null,
      skipped: 0,
      private_access: false,
      files: [
        {
          path: "a.md",
          sha: "1",
          content: "# A\n\nAlpha section with enough words.",
        },
      ],
    });

    const result = await syncSource(SOURCE, {
      kind: "github",
      repository: "acme/api",
    });

    expect(ragService.ingest).toHaveBeenCalledTimes(1);
    expect(ragService.finishSync).toHaveBeenCalledWith("src-1", ["a.md"]);
    expect(result).toMatchObject({ documents: 2, chunks: 9, removed: 1 });
  });

  it("records the failure on the source when indexing fails", async () => {
    ragService.githubFiles.mockRejectedValue(new Error("repository_not_found"));

    await expect(
      syncSource(SOURCE, { kind: "github", repository: "acme/api" }),
    ).rejects.toThrow("repository_not_found");
    expect(ragService.finishSync).toHaveBeenCalledWith(
      "src-1",
      null,
      "repository_not_found",
    );
  });
});
