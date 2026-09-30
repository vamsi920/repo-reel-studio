import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  data: null as Record<string, unknown> | null,
  error: null as { code: string; message: string } | null,
  inserted: [] as Record<string, unknown>[],
  listData: null as Record<string, unknown>[] | null,
  listError: null as { message: string } | null,
  listFilters: [] as { workspaceId: string; since: string }[],
  channelName: null as string | null,
  onConfig: null as Record<string, unknown> | null,
  onHandler: null as ((payload: unknown) => void) | null,
  removedChannel: null as unknown,
}));

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return state.isSupabaseConfigured;
  },
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
      select: () => ({
        eq: (_col: string, workspaceId: string) => ({
          gte: (_col2: string, since: string) => {
            state.listFilters.push({ workspaceId, since });
            return {
              order: async () => ({
                data: state.listData,
                error: state.listError,
              }),
            };
          },
        }),
      }),
    }),
    channel: (name: string) => {
      state.channelName = name;
      const channel = {
        on: (
          _event: string,
          config: Record<string, unknown>,
          handler: (payload: unknown) => void,
        ) => {
          state.onConfig = config;
          state.onHandler = handler;
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: (channel: unknown) => {
      state.removedChannel = channel;
    },
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
    state.isSupabaseConfigured = true;
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

describe("usageRepository.listEvents", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.listData = null;
    state.listError = null;
    state.listFilters = [];
  });

  it("returns an empty list without querying when the workspace id is empty", async () => {
    await expect(
      usageRepository.listEvents("", "2026-01-01T00:00:00Z"),
    ).resolves.toEqual([]);
    expect(state.listFilters).toHaveLength(0);
  });

  it("queries by workspace and since-timestamp and maps rows to camelCase", async () => {
    state.listData = [
      {
        id: "evt-1",
        workspace_id: "ws_a",
        source: "conversation",
        run_id: "conv-1",
        automation_id: null,
        cost_usd: 0.01,
        tokens: { promptTokens: 10 },
        occurred_at: "2026-01-02T00:00:00Z",
      },
    ];

    await expect(
      usageRepository.listEvents("ws_a", "2026-01-01T00:00:00Z"),
    ).resolves.toEqual([
      {
        id: "evt-1",
        workspaceId: "ws_a",
        source: "conversation",
        runId: "conv-1",
        automationId: undefined,
        costUsd: 0.01,
        tokens: { promptTokens: 10 },
        occurredAt: "2026-01-02T00:00:00Z",
      },
    ]);
    expect(state.listFilters).toEqual([
      { workspaceId: "ws_a", since: "2026-01-01T00:00:00Z" },
    ]);
  });

  it("returns an empty list instead of throwing when the query errors", async () => {
    state.listError = { message: "permission denied" };

    await expect(
      usageRepository.listEvents("ws_a", "2026-01-01T00:00:00Z"),
    ).resolves.toEqual([]);
  });
});

describe("usageRepository.subscribe", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.channelName = null;
    state.onConfig = null;
    state.onHandler = null;
    state.removedChannel = null;
  });

  it("subscribes to a workspace-scoped INSERT filter and maps incoming rows", () => {
    const onEvent = vi.fn();
    const unsubscribe = usageRepository.subscribe("ws_a", onEvent);

    expect(state.channelName).toBe("usage:ws_a");
    expect(state.onConfig).toMatchObject({
      event: "INSERT",
      schema: "public",
      table: "usage_events",
      filter: "workspace_id=eq.ws_a",
    });

    state.onHandler?.({
      new: {
        id: "evt-2",
        workspace_id: "ws_a",
        source: "automation_run",
        run_id: null,
        automation_id: "auto-1",
        cost_usd: 0.05,
        tokens: null,
        occurred_at: "2026-01-03T00:00:00Z",
      },
    });

    expect(onEvent).toHaveBeenCalledWith({
      id: "evt-2",
      workspaceId: "ws_a",
      source: "automation_run",
      runId: undefined,
      automationId: "auto-1",
      costUsd: 0.05,
      tokens: undefined,
      occurredAt: "2026-01-03T00:00:00Z",
    });

    unsubscribe();
    expect(state.removedChannel).not.toBeNull();
  });

  it("returns a no-op unsubscribe when workspaceId is empty", () => {
    const onEvent = vi.fn();
    const unsubscribe = usageRepository.subscribe("", onEvent);
    expect(state.channelName).toBeNull();
    expect(() => unsubscribe()).not.toThrow();
  });

  it("returns a no-op unsubscribe when Supabase isn't configured", () => {
    state.isSupabaseConfigured = false;
    const onEvent = vi.fn();
    const unsubscribe = usageRepository.subscribe("ws_a", onEvent);
    expect(state.channelName).toBeNull();
    expect(() => unsubscribe()).not.toThrow();
  });
});
