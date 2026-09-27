import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSkillInstalls } from "#/hooks/use-skill-installs";
import { useEventStore } from "#/stores/use-event-store";
import { useSkillInstallBannerStore } from "#/stores/skill-install-banner-store";
import type {
  CmdOutputMetadata,
  ExecuteBashObservation,
  ObservationEvent,
} from "#/types/agent-server/core";

const CONVERSATION_ID = "convo-1";

const makeInstallEvent = (
  id: string,
  skill = "codereview",
  workspace = "/tmp/demo-ws",
): ObservationEvent<ExecuteBashObservation> => ({
  id,
  timestamp: new Date().toISOString(),
  source: "environment",
  tool_name: "execute_bash",
  tool_call_id: `call-${id}`,
  action_id: `action-${id}`,
  observation: {
    kind: "ExecuteBashObservation",
    content: [
      {
        type: "text",
        text: `✅ Successfully installed '${skill}' to ${workspace}/.agents/skills/${skill}`,
      },
    ],
    command: "python3 fetch_skill.py",
    exit_code: 0,
    error: false,
    timeout: false,
    metadata: {} as CmdOutputMetadata,
  },
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  }
  return Wrapper;
};

describe("useSkillInstalls", () => {
  beforeEach(() => {
    useEventStore.getState().clearEventsForConversation(CONVERSATION_ID);
    useSkillInstallBannerStore.setState({ dismissedEventIds: {} });
  });

  afterEach(() => {
    useEventStore.getState().clearEvents();
    useSkillInstallBannerStore.setState({ dismissedEventIds: {} });
  });

  it("returns no installs when the event store hasn't loaded this conversation yet", () => {
    // The event store is global and shared across every mounted consumer, so
    // a hook instance rendered for a conversation the store hasn't (or no
    // longer) loaded -- e.g. a remount race between switching conversations
    // -- must not attribute another conversation's installs to this one.
    act(() => {
      useEventStore.getState().addEvent(makeInstallEvent("evt-1"));
    });

    const { result } = renderHook(() => useSkillInstalls("other-convo"), {
      wrapper: createWrapper(),
    });

    expect(result.current.installs).toEqual([]);
  });

  it("returns no installs when conversationId is null or undefined", () => {
    act(() => {
      useEventStore.getState().addEvent(makeInstallEvent("evt-1"));
    });

    const { result } = renderHook(() => useSkillInstalls(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.installs).toEqual([]);
  });

  it("detects installs for the loaded conversation and excludes dismissed ones", () => {
    act(() => {
      useEventStore.getState().addEvent(makeInstallEvent("evt-1", "alpha"));
      useEventStore.getState().addEvent(makeInstallEvent("evt-2", "beta"));
    });
    useSkillInstallBannerStore.getState().dismiss(["evt-1"]);

    const { result } = renderHook(() => useSkillInstalls(CONVERSATION_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current.installs).toEqual([
      expect.objectContaining({ eventId: "evt-2", skillName: "beta" }),
    ]);
  });

  it("dismissAll dismisses exactly the currently visible installs, not already-dismissed ones", () => {
    act(() => {
      useEventStore.getState().addEvent(makeInstallEvent("evt-1", "alpha"));
      useEventStore.getState().addEvent(makeInstallEvent("evt-2", "beta"));
    });
    useSkillInstallBannerStore.getState().dismiss(["evt-1"]);

    const { result } = renderHook(() => useSkillInstalls(CONVERSATION_ID), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.dismissAll();
    });

    expect(useSkillInstallBannerStore.getState().dismissedEventIds).toEqual({
      "evt-1": true,
      "evt-2": true,
    });
  });
});
