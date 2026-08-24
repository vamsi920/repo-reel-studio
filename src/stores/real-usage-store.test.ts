import { beforeEach, describe, expect, it } from "vitest";

import type { RealUsageEvent } from "#/lib/real-usage/types";

import useRealUsageStore from "./real-usage-store";

function event(overrides: Partial<RealUsageEvent> = {}): RealUsageEvent {
  return {
    id: "evt-1",
    workspaceId: "ws_a",
    conversationId: "conv-1",
    at: "2026-03-01T00:00:00.000Z",
    costUsd: 0.01,
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    model: "claude-sonnet-4-5",
    ...overrides,
  };
}

beforeEach(() => {
  useRealUsageStore.setState({ eventsByWorkspace: {} });
});

describe("real-usage-store", () => {
  it("appends distinct events", () => {
    useRealUsageStore.getState().recordUsageEvent(event({ id: "a" }));
    useRealUsageStore.getState().recordUsageEvent(event({ id: "b" }));
    expect(useRealUsageStore.getState().eventsByWorkspace.ws_a).toHaveLength(2);
  });

  it("upserts by id rather than duplicating", () => {
    useRealUsageStore
      .getState()
      .recordUsageEvent(event({ id: "a", costUsd: 0.01 }));
    useRealUsageStore
      .getState()
      .recordUsageEvent(event({ id: "a", costUsd: 0.02 }));

    const events = useRealUsageStore.getState().eventsByWorkspace.ws_a;
    expect(events).toHaveLength(1);
    expect(events[0].costUsd).toBe(0.02);
  });

  it("patches a client-generated id to the server id without duplicating", () => {
    useRealUsageStore.getState().recordUsageEvent(event({ id: "local-1" }));
    useRealUsageStore.getState().patchEventId("ws_a", "local-1", "server-1");

    const events = useRealUsageStore.getState().eventsByWorkspace.ws_a;
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("server-1");

    // A same-tab Realtime echo arrives keyed by the server id: upserts into
    // the same slot instead of appending a duplicate.
    useRealUsageStore.getState().recordUsageEvent(event({ id: "server-1" }));
    expect(useRealUsageStore.getState().eventsByWorkspace.ws_a).toHaveLength(1);
  });

  it("keeps workspaces isolated", () => {
    useRealUsageStore
      .getState()
      .recordUsageEvent(event({ id: "a", workspaceId: "ws_a" }));
    useRealUsageStore
      .getState()
      .recordUsageEvent(event({ id: "b", workspaceId: "ws_b" }));

    expect(useRealUsageStore.getState().eventsByWorkspace.ws_a).toHaveLength(1);
    expect(useRealUsageStore.getState().eventsByWorkspace.ws_b).toHaveLength(1);
  });

  it("clears only the targeted workspace", () => {
    useRealUsageStore
      .getState()
      .recordUsageEvent(event({ id: "a", workspaceId: "ws_a" }));
    useRealUsageStore
      .getState()
      .recordUsageEvent(event({ id: "b", workspaceId: "ws_b" }));

    useRealUsageStore.getState().clearWorkspace("ws_a");

    expect(useRealUsageStore.getState().eventsByWorkspace.ws_a).toBeUndefined();
    expect(useRealUsageStore.getState().eventsByWorkspace.ws_b).toHaveLength(1);
  });
});
