import React from "react";
import type { User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

export type SupabaseSessionStatus = "loading" | "none" | "anonymous" | "real";

export interface SupabaseSessionState {
  status: SupabaseSessionStatus;
  user: User | null;
}

const SUPABASE_SESSION_QUERY_KEY = ["supabase-session"] as const;

/**
 * Live view of the current Supabase Auth session, distinguishing "no
 * session", "anonymous session" (the silent per-browser bootstrap in
 * `auth-bootstrap.ts`), and "real" (a signed-in @neodevex.com user) --
 * only the last should ever unlock the app in `root.tsx`. Subscribes to
 * `onAuthStateChange` so the gate reacts the instant a magic-link redirect
 * lands, without waiting on a refetch.
 */
export function useSupabaseSession(): SupabaseSessionState {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!supabase) return undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: SUPABASE_SESSION_QUERY_KEY });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  const { data, isPending } = useQuery({
    queryKey: SUPABASE_SESSION_QUERY_KEY,
    queryFn: async () => {
      if (!supabase) return null;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.user ?? null;
    },
    enabled: isSupabaseConfigured,
    staleTime: Infinity,
    meta: { disableToast: true },
  });

  if (!isSupabaseConfigured) return { status: "none", user: null };
  if (isPending) return { status: "loading", user: null };
  if (!data) return { status: "none", user: null };
  return { status: data.is_anonymous ? "anonymous" : "real", user: data };
}
