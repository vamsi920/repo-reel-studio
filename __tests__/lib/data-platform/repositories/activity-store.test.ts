import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  insertError: null as { message: string } | null,
  insertedRow: null as Record<string, unknown> | null,
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
        state.insertedRow = row;
        return Promise.resolve({ error: state.insertError });
      },
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

const { activityStore } = await import(
  "#/lib/data-platform/repositories/activity-store"
);

describe("activityStore.record", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.insertError = null;
    state.insertedRow = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts a row with defaulted optional fields", async () => {
    await activityStore.record({
      workspaceId: "ws-1",
      actor: "user",
      kind: "memory.updated",
      summary: "Updated a memory record",
    });
    expect(state.insertedRow).toEqual({
      workspace_id: "ws-1",
      actor: "user",
      kind: "memory.updated",
      summary: "Updated a memory record",
      message: null,
      entity_type: null,
      entity_id: null,
      metadata: {},
    });
  });

  it("does nothing when workspaceId is empty", async () => {
    await activityStore.record({
      workspaceId: "",
      actor: "system",
      kind: "noop",
      summary: "should not persist",
    });
    expect(state.insertedRow).toBeNull();
  });

  it("does nothing when Supabase isn't configured", async () => {
    state.isSupabaseConfigured = false;
    await activityStore.record({
      workspaceId: "ws-1",
      actor: "agent",
      kind: "run.completed",
      summary: "should not persist",
    });
    expect(state.insertedRow).toBeNull();
  });

  it("swallows errors from the insert call", async () => {
    state.insertError = { message: "permission denied" };
    await expect(
      activityStore.record({
        workspaceId: "ws-1",
        actor: "user",
        kind: "memory.updated",
        summary: "Updated a memory record",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("activityStore.subscribe", () => {
  beforeEach(() => {
    state.isSupabaseConfigured = true;
    state.channelName = null;
    state.onConfig = null;
    state.onHandler = null;
    state.removedChannel = null;
  });

  it("subscribes to a workspace-scoped INSERT filter and maps incoming rows", () => {
    const onEvent = vi.fn();
    const unsubscribe = activityStore.subscribe("ws-1", onEvent);

    expect(state.channelName).toBe("activity:ws-1");
    expect(state.onConfig).toMatchObject({
      event: "INSERT",
      schema: "public",
      table: "activity_events",
      filter: "workspace_id=eq.ws-1",
    });

    state.onHandler?.({
      new: {
        workspace_id: "ws-1",
        actor: "agent",
        kind: "run.completed",
        summary: "Run finished",
        message: null,
        entity_type: null,
        entity_id: null,
        metadata: null,
      },
    });

    expect(onEvent).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      actor: "agent",
      kind: "run.completed",
      summary: "Run finished",
      message: undefined,
      entityType: undefined,
      entityId: undefined,
      metadata: {},
    });

    unsubscribe();
    expect(state.removedChannel).not.toBeNull();
  });

  it("returns a no-op unsubscribe when workspaceId is empty", () => {
    const onEvent = vi.fn();
    const unsubscribe = activityStore.subscribe("", onEvent);
    expect(state.channelName).toBeNull();
    expect(() => unsubscribe()).not.toThrow();
  });

  it("returns a no-op unsubscribe when Supabase isn't configured", () => {
    state.isSupabaseConfigured = false;
    const onEvent = vi.fn();
    const unsubscribe = activityStore.subscribe("ws-1", onEvent);
    expect(state.channelName).toBeNull();
    expect(() => unsubscribe()).not.toThrow();
  });
});
