import React from "react";
import { useQuery } from "@tanstack/react-query";
import AgentServerGitService from "#/api/git-service/agent-server-git-service.api";
import { useConversationId } from "#/hooks/use-conversation-id";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";
import { getGitPath } from "#/utils/get-git-path";
import type { GitChange } from "#/api/open-hands.types";

export const useUnifiedGetGitChanges = () => {
  const { conversationId } = useConversationId();
  const { data: conversation } = useActiveConversation();
  const [orderedChanges, setOrderedChanges] = React.useState<GitChange[]>([]);
  const previousDataRef = React.useRef<GitChange[] | null>(null);
  const previousConversationIdRef = React.useRef(conversationId);
  const runtimeIsReady = useRuntimeIsReady();

  // The Files/Changes tab isn't remounted on a conversation switch (only the
  // terminal tab gets a conversationId-keyed remount), so this hook's own
  // locally-ordered list must reset itself — otherwise it keeps rendering the
  // previous conversation's changed files (or, for paths both share, its
  // stale status) until the new conversation's fetch happens to resolve.
  if (previousConversationIdRef.current !== conversationId) {
    previousConversationIdRef.current = conversationId;
    previousDataRef.current = null;
    if (orderedChanges.length > 0) {
      setOrderedChanges([]);
    }
  }

  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const selectedRepository = conversation?.selected_repository;
  const workingDir = conversation?.workspace?.working_dir?.trim();

  const gitPath = React.useMemo(
    () => getGitPath(selectedRepository, workingDir),
    [selectedRepository, workingDir],
  );

  const result = useQuery({
    queryKey: [
      "file_changes",
      conversationId,
      conversationUrl,
      sessionApiKey,
      gitPath,
    ],
    queryFn: async () => {
      if (!conversationId) throw new Error("No conversation ID");

      return AgentServerGitService.getGitChanges(
        conversationId,
        conversationUrl,
        sessionApiKey,
        gitPath,
      );
    },
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes
    refetchOnMount: "always",
    enabled: runtimeIsReady && !!conversationId,
    meta: {
      disableToast: true,
    },
  });

  // Latest changes should be on top
  React.useEffect(() => {
    if (!result.isFetching && result.isSuccess && result.data) {
      const currentData = result.data;

      // If this is new data (not the same reference as before)
      if (currentData !== previousDataRef.current) {
        previousDataRef.current = currentData;

        // Figure out new items by comparing with what we already have
        if (Array.isArray(currentData)) {
          const currentByPath = new Map(
            currentData.map((item) => [item.path, item]),
          );
          const existingIds = new Set(orderedChanges.map((item) => item.path));

          // Filter out items that already exist in orderedChanges
          const newItems = currentData.filter(
            (item) => !existingIds.has(item.path),
          );

          // Keep the previous relative order for paths we already track, but
          // pull each one's fields (e.g. `status`) from the fresh fetch —
          // reusing the old `orderedChanges` object left a path's status
          // frozen at whatever it was the first time we saw it, so e.g. a
          // file that went from modified to deleted kept rendering as
          // "modified" (and the diff viewer kept requesting a diff for a
          // path that no longer exists) until it dropped out of the list
          // entirely and got re-added.
          const existingItems = orderedChanges
            .filter((item) => currentByPath.has(item.path))
            .map((item) => currentByPath.get(item.path)!);

          // Add new items to the beginning
          setOrderedChanges([...newItems, ...existingItems]);
        } else {
          // If not an array, just use the data directly
          setOrderedChanges([currentData]);
        }
      }
    }
  }, [result.isFetching, result.isSuccess, result.data]);

  return {
    data: orderedChanges,
    // `isPending`, not `isLoading`: the query is `enabled` only once
    // `runtimeIsReady`/`conversationId` resolve, and a disabled query has
    // `isLoading: false` (it requires an in-flight fetch) even though it has
    // never run and has no data yet. Callers (GitChanges' "waiting for
    // runtime" status, the Files tab's cloud-backend listing) used `isLoading`
    // to gate their own loading state, so during that window they fell
    // through to an empty/blank view instead of showing they were still
    // waiting on the runtime.
    isLoading: result.isPending,
    isFetching: result.isFetching,
    isSuccess: result.isSuccess,
    isError: result.isError,
    error: result.error,
    refetch: result.refetch,
  };
};
