import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isSupabaseConfigured } from "#/lib/data-platform/client";
import { resolveActiveTeam } from "#/lib/data-platform/repositories/repository-identity";
import { teamRepository } from "#/lib/data-platform/repositories/team-repository";
import { teamErrorMessageKey } from "#/lib/teams/errors";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { useSupabaseSession } from "./use-supabase-session";
import { TEAM_QUERY_KEYS } from "./query-keys";

/** Where the app lands after the active team changes. */
export const TEAM_SWITCH_LANDING_PATH = "/conversations";

/** How often an open tab re-checks which team it is in. */
const ACTIVE_TEAM_REFRESH_MS = 60_000;

/** Team features need a real account: the anonymous bootstrap has no email. */
function useTeamsEnabled(): boolean {
  const { status } = useSupabaseSession();
  return isSupabaseConfigured && status === "real";
}

const QUIET = { retry: false, meta: { disableToast: true } } as const;

/** The team this browser is working in, and the caller's role in it. */
export function useActiveTeam() {
  const enabled = useTeamsEnabled();
  return useQuery({
    queryKey: TEAM_QUERY_KEYS.active(),
    queryFn: resolveActiveTeam,
    enabled,
    staleTime: 15_000,
    refetchInterval: ACTIVE_TEAM_REFRESH_MS,
    refetchOnWindowFocus: true,
    ...QUIET,
  });
}

export function useMyTeams() {
  const enabled = useTeamsEnabled();
  return useQuery({
    queryKey: TEAM_QUERY_KEYS.mine(),
    queryFn: () => teamRepository.listMyTeams(),
    enabled,
    staleTime: 15_000,
    ...QUIET,
  });
}

/** Invitations addressed to the signed-in user's own email. */
export function useMyInvites() {
  const enabled = useTeamsEnabled();
  return useQuery({
    queryKey: TEAM_QUERY_KEYS.myInvites(),
    queryFn: () => teamRepository.listMyInvites(),
    enabled,
    staleTime: 30_000,
    refetchInterval: ACTIVE_TEAM_REFRESH_MS * 2,
    refetchOnWindowFocus: true,
    ...QUIET,
  });
}

export function useInvitePreview(token: string | undefined) {
  const enabled = useTeamsEnabled();
  return useQuery({
    queryKey: TEAM_QUERY_KEYS.invitePreview(token ?? ""),
    queryFn: () => teamRepository.getInvite(token as string),
    enabled: enabled && Boolean(token),
    staleTime: 0,
    ...QUIET,
  });
}

export function useTeamMembers(teamId: string | undefined) {
  const enabled = useTeamsEnabled();
  return useQuery({
    queryKey: TEAM_QUERY_KEYS.members(teamId),
    queryFn: () => teamRepository.listMembers(teamId as string),
    enabled: enabled && Boolean(teamId),
    staleTime: 10_000,
    ...QUIET,
  });
}

export function useTeamInvites(teamId: string | undefined, canManage: boolean) {
  const enabled = useTeamsEnabled();
  return useQuery({
    queryKey: TEAM_QUERY_KEYS.invites(teamId),
    queryFn: () => teamRepository.listInvites(teamId as string),
    enabled: enabled && Boolean(teamId) && canManage,
    staleTime: 10_000,
    ...QUIET,
  });
}

export function useTeamWorkspaces(teamId: string | undefined) {
  const enabled = useTeamsEnabled();
  return useQuery({
    queryKey: TEAM_QUERY_KEYS.workspaces(teamId),
    queryFn: () => teamRepository.listWorkspaces(teamId as string),
    enabled: enabled && Boolean(teamId),
    staleTime: 10_000,
    ...QUIET,
  });
}

export function useWorkspaceMembers(workspaceId: string | undefined) {
  const enabled = useTeamsEnabled();
  return useQuery({
    queryKey: TEAM_QUERY_KEYS.workspaceMembers(workspaceId),
    queryFn: () => teamRepository.listWorkspaceMembers(workspaceId as string),
    enabled: enabled && Boolean(workspaceId),
    staleTime: 5_000,
    ...QUIET,
  });
}

export function useTeamAuditLog(teamId: string | undefined, canRead: boolean) {
  const enabled = useTeamsEnabled();
  return useQuery({
    queryKey: TEAM_QUERY_KEYS.audit(teamId),
    queryFn: () => teamRepository.listAuditLog(teamId as string),
    enabled: enabled && Boolean(teamId) && canRead,
    staleTime: 10_000,
    ...QUIET,
  });
}

/**
 * A team write. Refreshes every team query afterwards and, unless the caller
 * handles the error itself, shows why it was refused in the user's language.
 */
export function useTeamMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>,
  options: { quiet?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("openhands");
  return useMutation({
    mutationFn,
    meta: { disableToast: true },
    onError: (error) => {
      if (!options.quiet) displayErrorToast(t(teamErrorMessageKey(error)));
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEYS.all }),
  });
}

/**
 * Makes `teamId` the team this browser works in, then reloads the app.
 *
 * A full reload, not a cache invalidation: connections, the company profile,
 * knowledge and every other team-scoped screen resolved the previous team
 * when they mounted, several with no team in their cache key. Starting clean
 * is the only way to be sure nothing from the other team stays on screen.
 */
export async function switchActiveTeam(teamId: string): Promise<void> {
  await teamRepository.setActiveTeam(teamId);
  window.location.assign(TEAM_SWITCH_LANDING_PATH);
}

export function useSwitchTeam() {
  const { t } = useTranslation("openhands");
  return useMutation({
    mutationFn: switchActiveTeam,
    meta: { disableToast: true },
    onError: (error) => displayErrorToast(t(teamErrorMessageKey(error))),
  });
}

/**
 * Reloads the app when the active team changes underneath an open tab --
 * the user was removed from it, it was deleted, or they switched in another
 * tab. Without this the tab would keep showing the old team's data until the
 * next manual refresh.
 */
export function useActiveTeamWatcher(): void {
  const { data: team } = useActiveTeam();
  const seenTeamId = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!team?.id) return;
    if (seenTeamId.current === null) {
      seenTeamId.current = team.id;
      return;
    }
    if (seenTeamId.current !== team.id) {
      seenTeamId.current = team.id;
      window.location.assign(TEAM_SWITCH_LANDING_PATH);
    }
  }, [team?.id]);
}
