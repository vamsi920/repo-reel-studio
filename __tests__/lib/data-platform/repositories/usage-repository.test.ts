import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: null as Record<string, unknown> | null,
  error: null as { code: string; message: string } | null,
  inserted: [] as Record<string, unknown>[],
}));

vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        state.inserted.push(row);
        return {
          select: () => ({
            single: async () => ({ data: state.data, error: state.error }),
          }),
        };
      },
    }),
  },
}));

const { usageRepository, resetUsageRecordFailureWarning } = await import(
  "#/lib/data-platform/repositories/usage-repository"
);

const input = {
  workspaceId: "ws_a",
  source: "conversation" as const,
  runId: "conv-1",
  costUsd: 0.01,
  tokens: { promptTokens: 10 },
};

describe("usageRepository.recordEvent", () => {
  beforeEach(() => {
    state.data = null;
    state.error = null;
    state.inserted = [];
    resetUsageRecordFailureWarning();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null without inserting when the workspace id is empty", async () => {
    await expect(
      usageRepository.recordEvent({ ...input, workspaceId: "" }),
    ).resolves.toBeNull();
    expect(state.inserted).toHaveLength(0);
  });

  it("inserts a conversation row and returns the server id", async () => {
    state.data = { id: "server-1" };

    await expect(usageRepository.recordEvent(input)).resolves.toBe("server-1");
    expect(state.inserted).toEqual([
      {
        workspace_id: "ws_a",
        source: "conversation",
        run_id: "conv-1",
        automation_id: null,
        cost_usd: 0.01,
        tokens: { promptTokens: 10 },
      },
    ]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("returns null and warns exactly once when RLS refuses the insert", async () => {
    state.error = {
      code: "42501",
      message: 'new row violates row-level security policy for table "usage_events"',
    };

    await expect(usageRepository.recordEvent(input)).resolves.toBeNull();
    await expect(usageRepository.recordEvent(input)).resolves.toBeNull();

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0][0]).toContain(
      "recordEvent failed",
    );
    expect(vi.mocked(console.warn).mock.calls[0][1]).toEqual(state.error);
  });
});
