import { NavLink, Outlet, useOutletContext } from "react-router";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { isSupabaseConfigured } from "#/lib/data-platform/client";
import type { ActiveTeam } from "#/lib/data-platform/repositories/repository-identity";
import { useSupabaseSession } from "#/hooks/query/use-supabase-session";
import { useActiveTeam, useMyTeams } from "#/hooks/query/use-teams";
import { MyInvitesPanel } from "#/components/features/teams/my-invites-panel";
import {
  ROLE_LABEL_KEY,
  teamCardClassName,
  teamMutedTextClassName,
} from "#/components/features/teams/team-labels";
import { cn } from "#/utils/utils";

/** What every team tab receives from this layout. */
export interface TeamOutletContext {
  team: ActiveTeam;
  currentUserId: string;
  personalTeamId: string | null;
}

export function useTeamOutletContext(): TeamOutletContext {
  return useOutletContext<TeamOutletContext>();
}

const TABS = [
  {
    to: "/team",
    testId: "members",
    labelKey: I18nKey.TEAM$TAB_MEMBERS,
    end: true,
  },
  {
    to: "/team/invitations",
    testId: "invitations",
    labelKey: I18nKey.TEAM$TAB_INVITATIONS,
    end: false,
  },
  {
    to: "/team/workspaces",
    testId: "workspaces",
    labelKey: I18nKey.TEAM$TAB_WORKSPACES,
    end: false,
  },
  {
    to: "/team/activity",
    testId: "activity",
    labelKey: I18nKey.TEAM$TAB_ACTIVITY,
    end: false,
  },
  {
    to: "/team/settings",
    testId: "settings",
    labelKey: I18nKey.TEAM$TAB_SETTINGS,
    end: false,
  },
];

/**
 * Team.
 *
 * The team the app is working in: who belongs to it, who has been invited,
 * the workspaces it shares and what changed. The team switcher lives in the
 * sidebar's account menu; this page always manages the active one.
 */
function TeamScreen() {
  const { t } = useTranslation("openhands");
  const { status, user } = useSupabaseSession();
  const { data: team, isPending, isError, refetch } = useActiveTeam();
  const { data: teams } = useMyTeams();

  const personalTeamId = teams?.find((item) => item.isPersonal)?.id ?? null;
  const isSignedIn = isSupabaseConfigured && status === "real" && Boolean(user);

  // Until the team is known the heading stays neutral: naming the personal
  // team here would flash the wrong team at someone working in another one.
  let teamTitle = t(I18nKey.TEAM$MANAGE);
  if (team) {
    teamTitle = team.isPersonal ? t(I18nKey.TEAM$PERSONAL_TITLE) : team.name;
  }

  let body: React.ReactNode;
  if (!isSupabaseConfigured || status === "none" || status === "anonymous") {
    body = (
      <p
        data-testid="team-unavailable"
        className={`${teamCardClassName} p-6 ${teamMutedTextClassName}`}
      >
        {t(I18nKey.TEAM$ERROR_NOT_CONFIGURED)}
      </p>
    );
  } else if (isError || (!isPending && !team)) {
    body = (
      <div
        data-testid="team-load-failed"
        role="alert"
        className={`${teamCardClassName} flex flex-wrap items-center justify-between gap-3 p-6`}
      >
        <p className={teamMutedTextClassName}>{t(I18nKey.TEAM$LOAD_FAILED)}</p>
        <button
          type="button"
          className="rounded-lg border border-[var(--oh-border)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--oh-interactive-hover)]"
          onClick={() => refetch()}
        >
          {t(I18nKey.TEAM$RETRY)}
        </button>
      </div>
    );
  } else if (!team || !user) {
    body = <p className={teamMutedTextClassName}>{t(I18nKey.TEAM$LOADING)}</p>;
  } else {
    const context: TeamOutletContext = {
      team,
      currentUserId: user.id,
      personalTeamId,
    };
    body = (
      <>
        <nav className="flex gap-1 overflow-x-auto border-b border-[var(--border-color)]">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              data-testid={`team-tab-${tab.testId}`}
              className={({ isActive }) =>
                cn(
                  "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "border-[var(--primary-500)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )
              }
            >
              {t(tab.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="min-h-0 flex-1">
          <Outlet context={context} />
        </div>
      </>
    );
  }

  return (
    <main
      data-testid="team-screen"
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6"
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Users size={20} className="text-[var(--primary-500)]" />
          <h1
            data-testid="team-title"
            className="text-xl font-semibold text-[var(--text-primary)]"
          >
            {teamTitle}
          </h1>
          {team ? (
            <span
              data-testid="team-my-role"
              className="rounded-full bg-[var(--oh-interactive-hover)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
            >
              {t(ROLE_LABEL_KEY[team.role])}
            </span>
          ) : null}
        </div>
        <p className={teamMutedTextClassName}>
          {team?.isPersonal
            ? t(I18nKey.TEAM$SUBTITLE_PERSONAL)
            : t(I18nKey.TEAM$SUBTITLE)}
        </p>
      </header>

      {isSignedIn ? <MyInvitesPanel /> : null}
      {body}
    </main>
  );
}

export default TeamScreen;
