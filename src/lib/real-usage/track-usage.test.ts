import { beforeEach, describe, expect, it, vi } from "vitest";

import useRealUsageStore from "#/stores/real-usage-store";

const recordEvent = vi.fn(async (_input: unknown) => "server-1");

vi.mock("#/lib/data-platform", () => ({
  usageRepository: {
    recordEvent: (input: unknown) => recordEvent(input),
  },
}));

import { resetUsageTracking, trackRealUsage } from "./track-usage";

function usage(overrides: Partial<{ promptTokens: number }> = {}) {
  return {
    promptTokens: 0,
    completionTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ...overrides,
  };
}

beforeEach(() => {
  resetUsageTracking();
  recordEvent.mockClear();
  useRealUsageStore.setState({ eventsByWorkspace: {} });
});

describe("trackRealUsage", () => {
  it("records exactly one event for a genuine increase", () => {
    trackRealUsage({
      workspaceId: "ws_a",
      conversationId: "conv-1",
      cost: 0.01,
      usage: usage({ promptTokens: 10 }),
      model: "claude-sonnet-4-5",
    });

    const events = useRealUsageStore.getState().eventsByWorkspace.ws_a;
    expect(events).toHaveLength(1);
    expect(events[0].usage.promptTokens).toBe(10);
    expect(events[0].costUsd).toBeCloseTo(0.01, 10);
    expect(recordEvent).toHaveBeenCalledTimes(1);
  });

  it("records nothing when workspace or conversation is unknown", () => {
    trackRealUsage({
      workspaceId: null,
      conversationId: "conv-1",
      cost: 0.01,
      usage: usage({ promptTokens: 10 }),
      model: null,
    });
    trackRealUsage({
      workspaceId: "ws_a",
      conversationId: null,
      cost: 0.01,
      usage: usage({ promptTokens: 10 }),
      model: null,
    });

    expect(useRealUsageStore.getState().eventsByWorkspace.ws_a).toBeUndefined();
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("records nothing when metrics have not changed since the last call", () => {
    const input = {
      workspaceId: "ws_a",
      conversationId: "conv-1",
      cost: 0.01,
      usage: usage({ promptTokens: 10 }),
      model: null,
    };
    trackRealUsage(input);
    trackRealUsage(input);

    expect(useRealUsageStore.getState().eventsByWorkspace.ws_a).toHaveLength(1);
    expect(recordEvent).toHaveBeenCalledTimes(1);
  });

  it("records the genuine increment on a second real update", () => {
    trackRealUsage({
      workspaceId: "ws_a",
      conversationId: "conv-1",
      cost: 0.01,
      usage: usage({ promptTokens: 10 }),
      model: null,
    });
    trackRealUsage({
      workspaceId: "ws_a",
      conversationId: "conv-1",
      cost: 0.03,
      usage: usage({ promptTokens: 25 }),
      model: null,
    });

    const events = useRealUsageStore.getState().eventsByWorkspace.ws_a;
    expect(events).toHaveLength(2);
    expect(events[1].usage.promptTokens).toBe(15);
    expect(events[1].costUsd).toBeCloseTo(0.02, 10);
  });

  it("treats a new conversation's first update as a full delta, not diffed against a prior conversation", () => {
    trackRealUsage({
      workspaceId: "ws_a",
      conversationId: "conv-1",
      cost: 0.5,
      usage: usage({ promptTokens: 1000 }),
      model: null,
    });
    trackRealUsage({
      workspaceId: "ws_a",
      conversationId: "conv-2",
      cost: 0.01,
      usage: usage({ promptTokens: 10 }),
      model: null,
    });

    const events = useRealUsageStore.getState().eventsByWorkspace.ws_a;
    expect(events).toHaveLength(2);
    expect(events[1].usage.promptTokens).toBe(10);
    expect(events[1].costUsd).toBeCloseTo(0.01, 10);
  });

  it("patches the local event id once the remote insert resolves", async () => {
    trackRealUsage({
      workspaceId: "ws_a",
      conversationId: "conv-1",
      cost: 0.01,
      usage: usage({ promptTokens: 10 }),
      model: null,
    });

    await vi.waitFor(() => {
      const events = useRealUsageStore.getState().eventsByWorkspace.ws_a;
      expect(events[0].id).toBe("server-1");
    });
  });
});
