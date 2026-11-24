import { useEffect, useRef } from "react";

import { subscribeWorkspaceMemory } from "#/api/workspace-memory/workspace-memory-store.api";
import {
  eventId,
  eventTimestamp,
  runObservation,
  userMessageText,
} from "#/lib/neo-brain/observe";
import { RecoveryTracker } from "#/lib/neo-brain/run-learnings";
import {
  CONSOLIDATE_EVERY_MS,
  consolidateWorkspace,
  exportBrainMap,
  ingestUserMessage,
  learn,
} from "#/services/neo-brain";
import { useEventStore } from "#/stores/use-event-store";
import { useNeoBrainStore } from "#/stores/neo-brain-store";

import { useActiveConversation } from "./query/use-active-conversation";
import { useRuntimeIsReady } from "./use-runtime-is-ready";
import { useWorkspaceId } from "./use-workspace-id";

/** Lets a burst of learnings settle before the map is rewritten. */
const MAP_DEBOUNCE_MS = 5_000;

function onIdle(run: () => void): () => void {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const idle = window as Window & {
      requestIdleCallback: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number;
      cancelIdleCallback: (handle: number) => void;
    };
    const handle = idle.requestIdleCallback(run, { timeout: 5_000 });
    return () => idle.cancelIdleCallback(handle);
  }
  const timer = setTimeout(run, 1_000);
  return () => clearTimeout(timer);
}

/**
 * Neo Brain's background half, mounted once per conversation route:
 *
 * 1. learns from every user message and every shell result, once per event
 *    (history included the first time a conversation is opened, never twice);
 * 2. runs the consolidation pass on idle, at most daily per workspace;
 * 3. keeps `.neodevex/brain/BRAIN.md` in the workspace current while a
 *    runtime is alive.
 *
 * Everything is best-effort and silent; nothing here blocks the chat.
 */
export function useNeoBrain(): void {
  const workspaceId = useWorkspaceId();
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady({ allowAgentError: true });
  const events = useEventStore((state) => state.events);
  const conversationId = conversation?.id ?? null;
  const repositoryId = conversation?.selected_repository ?? undefined;
  const tracker = useRef<RecoveryTracker | null>(null);

  useEffect(() => {
    tracker.current =
      workspaceId && conversationId
        ? new RecoveryTracker({ workspaceId, conversationId, repositoryId })
        : null;
  }, [workspaceId, conversationId, repositoryId]);

  // 1. Learn from new events.
  useEffect(() => {
    if (!workspaceId || !conversationId || events.length === 0) return;
    const store = useNeoBrainStore.getState();
    const through = store.learnedThrough[conversationId] ?? "";
    let newest = through;

    events.forEach((event) => {
      const at = eventTimestamp(event);
      if (!at || at <= through) return;
      if (at > newest) newest = at;

      const text = userMessageText(event);
      if (text) {
        ingestUserMessage(text, {
          workspaceId,
          conversationId,
          repositoryId,
          eventId: eventId(event),
          observedAt: at,
        });
        return;
      }

      const run = runObservation(event);
      const recovery = run ? tracker.current?.observe(run) : null;
      if (recovery) learn(workspaceId, [recovery], conversationId);
    });

    if (newest > through) store.markLearnedThrough(conversationId, newest);
  }, [events, workspaceId, conversationId, repositoryId]);

  // 2. Consolidate on idle, and again on a slow timer for long sessions.
  useEffect(() => {
    if (!workspaceId) return undefined;
    const cancelIdle = onIdle(() => consolidateWorkspace(workspaceId));
    const timer = setInterval(
      () => consolidateWorkspace(workspaceId),
      Math.min(CONSOLIDATE_EVERY_MS, 30 * 60 * 1000),
    );
    return () => {
      cancelIdle();
      clearInterval(timer);
    };
  }, [workspaceId]);

  // 3. Keep BRAIN.md current in the workspace folder.
  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const workingDir = conversation?.workspace?.working_dir?.trim();
  const projectName = conversation?.selected_repository ?? undefined;

  useEffect(() => {
    if (!workspaceId || !runtimeIsReady || !workingDir || !conversationUrl) {
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    // Forced once per mount: a fresh clone may have lost an earlier copy.
    let force = true;
    const write = () => {
      timer = null;
      void exportBrainMap(
        workspaceId,
        { conversationUrl, sessionApiKey, workingDir },
        { force, projectName },
      ).then((result) => {
        if (!cancelled && result.ok) force = false;
      });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, MAP_DEBOUNCE_MS);
    };

    schedule();
    const unsubscribeMemory = subscribeWorkspaceMemory(workspaceId, schedule);
    const unsubscribePending = useNeoBrainStore.subscribe((state, previous) => {
      if (state.pending[workspaceId] !== previous.pending[workspaceId]) {
        schedule();
      }
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribeMemory();
      unsubscribePending();
    };
  }, [
    workspaceId,
    runtimeIsReady,
    workingDir,
    conversationUrl,
    sessionApiKey,
    projectName,
  ]);
}
