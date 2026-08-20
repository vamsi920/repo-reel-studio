import { useEffect } from "react";

import { flushMirror } from "#/api/workspace-memory/workspace-memory-mirror";
import {
  setActivitySink,
  watchWorkspaceForInvalidation,
} from "#/lib/workspace-memory";
import useWorkspaceMemoryStore from "#/stores/workspace-memory-store";

import { useActiveConversation } from "./query/use-active-conversation";
import { useRuntimeIsReady } from "./use-runtime-is-ready";
import { useWorkspaceId } from "./use-workspace-id";

/** Frequent enough to feel live, rare enough to stay out of the way. */
const FLUSH_INTERVAL_MS = 30_000;

/**
 * Runs the background half of workspace memory: pipes updater activity into
 * the store, keeps the context cache honest, and drains queued records to the
 * workspace file whenever a runtime is alive to write with.
 *
 * Mounted once, high in the conversation tree. Everything it does is
 * best-effort and silent.
 */
export function useMemoryUpdater(): void {
  const workspaceId = useWorkspaceId();
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady();
  const pushActivity = useWorkspaceMemoryStore((state) => state.pushActivity);
  const recordMirrorResult = useWorkspaceMemoryStore(
    (state) => state.recordMirrorResult,
  );
  const setActiveWorkspace = useWorkspaceMemoryStore(
    (state) => state.setActiveWorkspace,
  );

  useEffect(() => {
    setActivitySink(pushActivity);
    return () => setActivitySink(null);
  }, [pushActivity]);

  useEffect(() => {
    setActiveWorkspace(workspaceId);
  }, [workspaceId, setActiveWorkspace]);

  // Another tab writing to the same workspace must not leave this one serving
  // a stale cached context.
  useEffect(() => {
    if (!workspaceId) return undefined;
    return watchWorkspaceForInvalidation(workspaceId);
  }, [workspaceId]);

  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const workingDir = conversation?.workspace?.working_dir?.trim();

  useEffect(() => {
    if (!workspaceId || !runtimeIsReady || !workingDir) return undefined;

    let cancelled = false;
    const flush = async () => {
      const result = await flushMirror(workspaceId, {
        conversationUrl,
        sessionApiKey,
        workingDir,
      });
      if (cancelled || (result.flushed === 0 && !result.error)) return;
      recordMirrorResult(workspaceId, {
        flushed: result.flushed,
        error: result.error,
      });
    };

    void flush();
    const timer = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    workspaceId,
    runtimeIsReady,
    conversationUrl,
    sessionApiKey,
    workingDir,
    recordMirrorResult,
  ]);
}
