import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { syncLlmProfiles } from "#/lib/data-platform/llm-profile-sync";
import { LLM_PROFILES_QUERY_KEYS } from "#/hooks/query/query-keys";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Brings the user's saved LLM profiles to whichever agent-server is active
 * (laptop or production) and saves this server's profiles for the others.
 */
export function useLlmProfileSync() {
  const { backend } = useActiveBackend();
  const queryClient = useQueryClient();
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      syncLlmProfiles()
        .then((created) => {
          if (!cancelled && created.length > 0) {
            queryClient.invalidateQueries({
              queryKey: LLM_PROFILES_QUERY_KEYS.all,
            });
          }
        })
        .catch((error) => {
          console.warn("[llm-profile-sync] pass failed", error);
        });
    };
    run();
    const timer = setInterval(run, SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [backend.id, backend.host, queryClient]);
}
