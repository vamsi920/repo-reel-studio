import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import { invalidateConnectionCaches } from "#/lib/environment/invalidate-connection-caches";
import { useEnvironmentOrgId } from "#/hooks/query/use-environment-org";

/**
 * Keeps every open surface honest about what is connected.
 *
 * Mounted once, app-wide. A connection made in the setup studio shows up in a
 * repository picker on another route, in another tab, and in a colleague's
 * browser -- without anyone reloading. That is the difference between "the
 * agent connected GitHub" and "GitHub is connected".
 *
 * Follows the subscription pattern already used by
 * `src/lib/data-platform/repositories/usage-repository.ts`.
 */
export function useConnectionsRealtimeSync(): void {
  const queryClient = useQueryClient();
  const { data: orgId } = useEnvironmentOrgId();

  React.useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !orgId) return undefined;
    const client = supabase;

    const channel = client
      .channel(`connections-sync:${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connections",
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          // SIGNAL ONLY -- the payload is deliberately ignored.
          //
          // `connections` revokes column-level SELECT on the encrypted
          // credential columns from `authenticated`, but Realtime change
          // payloads are assembled from the WAL and do not honour column
          // grants the way a query does. Reading `payload.new` here to skip a
          // refetch would be reading ciphertext the browser is not supposed to
          // receive. Refetching is cheap; this is not the place to optimise.
          void invalidateConnectionCaches(queryClient);
        },
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [orgId, queryClient]);
}
