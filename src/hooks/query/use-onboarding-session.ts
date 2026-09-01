import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import { ENVIRONMENT_QUERY_KEYS } from "./query-keys";
import { useEnvironmentOrgId } from "./use-environment-org";

/**
 * The org's live onboarding conversation.
 *
 * Stored server-side rather than in the browser for three reasons that all
 * showed up in the first version: an OAuth redirect throws the page away
 * mid-flow, onboarding a company takes longer than one sitting, and the person
 * who starts it is often not the person who finishes it. A localStorage id
 * survives none of those.
 */
export interface OnboardingSession {
  id: string;
  conversationId: string;
  phase: string;
  status: "active" | "completed" | "abandoned";
  startedBy: string | null;
  createdAt: string;
}

function toSession(row: Record<string, unknown>): OnboardingSession {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    phase: (row.phase as string) ?? "discovery",
    status: row.status as OnboardingSession["status"],
    startedBy: (row.started_by as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export function useOnboardingSession() {
  const { data: orgId } = useEnvironmentOrgId();

  return useQuery({
    queryKey: ENVIRONMENT_QUERY_KEYS.session(orgId ?? undefined),
    queryFn: async (): Promise<OnboardingSession | null> => {
      if (!isSupabaseConfigured || !supabase || !orgId) return null;
      const { data, error } = await supabase
        .from("onboarding_sessions")
        .select("id, conversation_id, phase, status, started_by, created_at")
        .eq("org_id", orgId)
        .eq("status", "active")
        .maybeSingle();
      if (error || !data) return null;
      return toSession(data as unknown as Record<string, unknown>);
    },
    enabled: Boolean(orgId),
    staleTime: 1000 * 30,
    retry: false,
    meta: { disableToast: true },
  });
}

export function useStartOnboardingSession() {
  const queryClient = useQueryClient();
  const { data: orgId } = useEnvironmentOrgId();

  return useMutation({
    mutationFn: async (conversationId: string): Promise<OnboardingSession> => {
      if (!isSupabaseConfigured || !supabase || !orgId) {
        throw new Error("onboarding session storage is not configured");
      }
      const { data, error } = await supabase
        .from("onboarding_sessions")
        .insert({
          org_id: orgId,
          conversation_id: conversationId,
          status: "active",
          phase: "discovery",
        })
        .select("id, conversation_id, phase, status, started_by, created_at")
        .single();

      if (error) {
        // A partial unique index allows only one active session per org, so a
        // colleague who opened the studio a moment earlier wins the race. That
        // is the desired outcome -- join their thread rather than forking the
        // company's onboarding into two transcripts nobody reconciles.
        const { data: existing } = await supabase
          .from("onboarding_sessions")
          .select("id, conversation_id, phase, status, started_by, created_at")
          .eq("org_id", orgId)
          .eq("status", "active")
          .maybeSingle();
        if (existing) {
          return toSession(existing as unknown as Record<string, unknown>);
        }
        throw new Error(error.message);
      }

      return toSession(data as unknown as Record<string, unknown>);
    },
    onSuccess: (session) => {
      queryClient.setQueryData(
        ENVIRONMENT_QUERY_KEYS.session(orgId ?? undefined),
        session,
      );
    },
  });
}

export function useEndOnboardingSession() {
  const queryClient = useQueryClient();
  const { data: orgId } = useEnvironmentOrgId();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: "completed" | "abandoned";
    }) => {
      if (!isSupabaseConfigured || !supabase) return;
      await supabase
        .from("onboarding_sessions")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("id", input.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ENVIRONMENT_QUERY_KEYS.session(orgId ?? undefined),
      });
    },
  });
}
