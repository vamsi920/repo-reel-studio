import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryRecord } from "#/lib/workspace-memory/types";

const state = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  upserted: null as Record<string, unknown>[] | null,
  upsertError: null as { message: string } | null,
  selectData: null as Record<string, unknown>[] | null,
  selectError: null as { message: string } | null,
}));

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return state.isSupabaseConfigured;
  },
  supabase: {
    from: () => ({
      upsert: (rows: Record<string, unknown>[]) => {
        state.upserted = rows;
        return Promise.resolve({ error: state.upsertError });
      },
      select: () => ({
        eq: async () => ({ data: state.selectData, error: state.selectError }),
      }),
    }),
  },
}));

const { memoryRepository } = await import(
  "#/lib/data-platform/repositories/memory-repository"
);

function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "rec-1",
    workspaceId: "ws-1",
    kind: "fact",
    subject: "subject",
    statement: "statement",
    tags: ["a"],
    provenance: "user",
    status: "active",
    confidence: 0.9,
    createdAt: "2026-09-01T00:00:00.000Z",
    supersededAt: null,
    supersededById: null,
    conflictsWith: [],
    pinned: false,
    tokenCost: 5,
    ...overrides,
  } as MemoryRecord;
}

describe("memoryRepository.upsertRecords", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.upserted = null;
    state.upsertError = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok without upserting when there are no records", async () => {
    await expect(memoryRepository.upsertRecords("ws-1", [])).resolves.toEqual({
      ok: true,
    });
    expect(state.upserted).toBeNull();
  });

  it("filters out records that don't belong to the given workspace", async () => {
    const owned = makeRecord({ id: "rec-owned", workspaceId: "ws-1" });
    const foreign = makeRecord({ id: "rec-foreign", workspaceId: "ws-2" });

    await expect(
      memoryRepository.upsertRecords("ws-1", [owned, foreign]),
    ).resolves.toEqual({ ok: true });
    expect(state.upserted).toHaveLength(1);
    expect(state.upserted?.[0]).toMatchObject({ id: "rec-owned" });
  });

  it("skips the upsert entirely when nothing is owned by the workspace", async () => {
    const foreign = makeRecord({ id: "rec-foreign", workspaceId: "ws-2" });
    await expect(
      memoryRepository.upsertRecords("ws-1", [foreign]),
    ).resolves.toEqual({ ok: true });
    expect(state.upserted).toBeNull();
  });

  it("returns ok:false with the error message when the upsert fails", async () => {
    state.upsertError = { message: "permission denied for table memory_records" };
    await expect(
      memoryRepository.upsertRecords("ws-1", [makeRecord()]),
    ).resolves.toEqual({
      ok: false,
      error: "permission denied for table memory_records",
    });
  });
});

describe("memoryRepository.listRecords", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.selectData = [];
    state.selectError = null;
  });

  it("returns [] for an empty workspaceId without querying", async () => {
    await expect(memoryRepository.listRecords("")).resolves.toEqual([]);
  });

  it("maps rows to MemoryRecord, defaulting nullish array/number fields", async () => {
    state.selectData = [
      {
        id: "rec-1",
        workspace_id: "ws-1",
        kind: "fact",
        subject: "subject",
        statement: "statement",
        tags: null,
        provenance: "user",
        status: "active",
        confidence: null,
        pinned: true,
        created_at: "2026-09-01T00:00:00.000Z",
        superseded_at: null,
        superseded_by_id: null,
        conflicts_with: null,
        token_cost: null,
      },
    ];

    const result = await memoryRepository.listRecords("ws-1");
    expect(result).toEqual([
      {
        id: "rec-1",
        workspaceId: "ws-1",
        kind: "fact",
        subject: "subject",
        statement: "statement",
        tags: [],
        provenance: "user",
        status: "active",
        confidence: 0,
        createdAt: "2026-09-01T00:00:00.000Z",
        supersededAt: null,
        supersededById: null,
        conflictsWith: [],
        pinned: true,
        tokenCost: 0,
      },
    ]);
  });

  it("returns [] when the query errors", async () => {
    state.selectData = null;
    state.selectError = { message: "permission denied" };
    await expect(memoryRepository.listRecords("ws-1")).resolves.toEqual([]);
  });
});
