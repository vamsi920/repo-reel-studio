import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  rpcData: null as Record<string, unknown>[] | null,
  rpcError: null as { message: string } | null,
  rpcCall: null as { fn: string; args: unknown } | null,
  upsertError: null as { message: string } | null,
  upsertCall: null as { rows: unknown; options: unknown } | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return state.isSupabaseConfigured;
  },
  supabase: {
    rpc: (fn: string, args: unknown) => {
      state.rpcCall = { fn, args };
      return Promise.resolve({ data: state.rpcData, error: state.rpcError });
    },
    from: () => ({
      upsert: (rows: unknown, options: unknown) => {
        state.upsertCall = { rows, options };
        return Promise.resolve({ error: state.upsertError });
      },
    }),
  },
}));

const { vectorStore } = await import("#/lib/data-platform/vector-store");

describe("vectorStore.searchWorkspaceMemory", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.rpcData = null;
    state.rpcError = null;
    state.rpcCall = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns [] without calling the RPC when workspaceId is empty", async () => {
    await expect(
      vectorStore.searchWorkspaceMemory("", [0.1, 0.2]),
    ).resolves.toEqual([]);
    expect(state.rpcCall).toBeNull();
  });

  it("calls the RPC with the workspace id, embedding, and match count", async () => {
    state.rpcData = [];
    await vectorStore.searchWorkspaceMemory("ws-1", [0.1, 0.2], 5);
    expect(state.rpcCall).toEqual({
      fn: "search_workspace_memory",
      args: { ws_id: "ws-1", query_embedding: [0.1, 0.2], match_count: 5 },
    });
  });

  it("maps rows to MemorySimilarityMatch", async () => {
    state.rpcData = [
      {
        record_id: "rec-1",
        statement: "statement",
        subject: "subject",
        kind: "fact",
        status: "active",
        similarity: 0.87,
      },
    ];
    await expect(
      vectorStore.searchWorkspaceMemory("ws-1", [0.1]),
    ).resolves.toEqual([
      {
        recordId: "rec-1",
        statement: "statement",
        subject: "subject",
        kind: "fact",
        status: "active",
        similarity: 0.87,
      },
    ]);
  });

  it("returns [] when the RPC errors", async () => {
    state.rpcError = { message: "function does not exist" };
    await expect(
      vectorStore.searchWorkspaceMemory("ws-1", [0.1]),
    ).resolves.toEqual([]);
  });

  it("returns [] when Supabase isn't configured", async () => {
    state.isSupabaseConfigured = false;
    await expect(
      vectorStore.searchWorkspaceMemory("ws-1", [0.1]),
    ).resolves.toEqual([]);
    expect(state.rpcCall).toBeNull();
  });
});

describe("vectorStore.upsertEmbedding", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.upsertError = null;
    state.upsertCall = null;
  });

  it("upserts the embedding row keyed on record_id", async () => {
    await vectorStore.upsertEmbedding("rec-1", "ws-1", [0.1, 0.2], "model-x");
    expect(state.upsertCall).toEqual({
      rows: {
        record_id: "rec-1",
        workspace_id: "ws-1",
        embedding: [0.1, 0.2],
        model: "model-x",
      },
      options: { onConflict: "record_id" },
    });
  });

  it("is a no-op when Supabase isn't configured", async () => {
    state.isSupabaseConfigured = false;
    await vectorStore.upsertEmbedding("rec-1", "ws-1", [0.1], "model-x");
    expect(state.upsertCall).toBeNull();
  });

  it("swallows errors from the upsert call", async () => {
    state.upsertError = { message: "permission denied" };
    await expect(
      vectorStore.upsertEmbedding("rec-1", "ws-1", [0.1], "model-x"),
    ).resolves.toBeUndefined();
  });
});
