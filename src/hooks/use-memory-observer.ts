import { useEffect, useRef } from "react";

import {
  commandCandidate,
  submitMemoryCandidate,
} from "#/lib/workspace-memory";
import { useEventStore } from "#/stores/use-event-store";
import type { OpenHandsEvent } from "#/types/agent-server/core";

import { useActiveConversation } from "./query/use-active-conversation";
import { useWorkspaceId } from "./use-workspace-id";

interface BashObservationLike {
  observation?: {
    kind?: string;
    command?: string | null;
    exit_code?: number | null;
  };
  id?: string | number;
  timestamp?: string;
}

function asBashObservation(event: OpenHandsEvent): BashObservationLike | null {
  const candidate = event as BashObservationLike;
  if (candidate.observation?.kind !== "ExecuteBashObservation") return null;
  return candidate;
}

/**
 * Watches the conversation event stream for grounded observations and hands
 * them to the memory updater. Reads only; it never blocks or annotates the UI.
 */
export function useMemoryObserver(): void {
  const workspaceId = useWorkspaceId();
  const { data: conversation } = useActiveConversation();
  const events = useEventStore((state) => state.events);
  /** Events are appended, never rewritten, so a high-water mark is enough. */
  const processedCount = useRef(0);

  useEffect(() => {
    // A conversation switch resets the store, so reset the mark with it.
    processedCount.current = 0;
  }, [conversation?.id]);

  useEffect(() => {
    if (!workspaceId) return;
    if (events.length <= processedCount.current) {
      processedCount.current = events.length;
      return;
    }

    const fresh = events.slice(processedCount.current);
    processedCount.current = events.length;

    fresh.forEach((event) => {
      const bash = asBashObservation(event);
      if (!bash?.observation) return;

      const candidate = commandCandidate(
        {
          command: bash.observation.command ?? null,
          exitCode: bash.observation.exit_code ?? null,
          eventId: bash.id !== undefined ? String(bash.id) : undefined,
          observedAt: bash.timestamp,
        },
        {
          workspaceId,
          conversationId: conversation?.id ?? null,
          repositoryId: conversation?.selected_repository ?? undefined,
        },
      );

      if (candidate) submitMemoryCandidate(candidate);
    });
  }, [
    events,
    workspaceId,
    conversation?.id,
    conversation?.selected_repository,
  ]);
}
