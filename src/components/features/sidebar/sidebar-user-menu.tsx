import React from "react";
import { useTranslation } from "react-i18next";
import { Check, LogOut, Plus, User, Users } from "lucide-react";
import { useNavigation } from "#/context/navigation-context";
import { useSupabaseSession } from "#/hooks/query/use-supabase-session";
import { signOutAndRedirect } from "#/lib/data-platform/auth-flow";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { I18nKey } from "#/i18n/declaration";
import { ContextMenu } from "#/ui/context-menu";
import { ContextMenuListItem } from "#/components/features/context-menu/context-menu-list-item";
import { cn } from "#/utils/utils";
import { dropdownTriggerShellClassName } from "#/utils/dropdown-classes";
import {
  useActiveTeam,
  useActiveTeamWatcher,
  useMyInvites,
  useMyTeams,
  useSwitchTeam,
} from "#/hooks/query/use-teams";
import { CreateTeamModal } from "#/components/features/teams/create-team-modal";
import { SidebarCollapsedIconSlot } from "./sidebar-collapsed-icon-slot";
import {
  sidebarNavLabelClassName,
  sidebarNavRowClassName,
} from "./sidebar-layout";

const ICON_SIZE = 18;

/** The team page, where members, invitations and workspaces are managed. */
const TEAM_PATH = "/team";

interface SidebarUserMenuProps {
  collapsed: boolean;
}

/**
 * Persistent user identity, team switcher and sign-out in the sidebar rail.
 * The team named under the email is the one every team-scoped screen
 * (connections, knowledge, workspaces) is showing. Only
 * renders for a real (non-anonymous) Supabase session -- with the route
 * gate in root.tsx, that's the only state this should ever mount in, but it
 * stays defensive so it degrades to nothing instead of a broken row if
 * rendered while the session is still resolving or unconfigured.
 */
export function SidebarUserMenu({ collapsed }: SidebarUserMenuProps) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const { status, user } = useSupabaseSession();
  const [open, setOpen] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = React.useState(false);
  const { data: activeTeam } = useActiveTeam();
  const { data: teams } = useMyTeams();
  const { data: myInvites } = useMyInvites();
  const switchTeam = useSwitchTeam();
  useActiveTeamWatcher();
  const menuRef = useClickOutsideElement<HTMLUListElement>(() =>
    setOpen(false),
  );

  const email = user?.email;

  if (status !== "real" || !email) return null;

  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen((prev) => !prev);
  };

  const handleSignOut = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsSigningOut(true);
    await signOutAndRedirect(navigate);
  };

  const inviteCount = myInvites?.length ?? 0;
  const teamName = activeTeam
    ? activeTeam.isPersonal
      ? t(I18nKey.TEAM$PERSONAL_TITLE)
      : activeTeam.name
    : null;

  const handleSwitch = (teamId: string) => {
    setOpen(false);
    if (teamId !== activeTeam?.id) switchTeam.mutate(teamId);
  };

  const handleOpenTeam = () => {
    setOpen(false);
    navigate(TEAM_PATH);
  };

  return (
    <div className="relative">
      <button
        type="button"
        data-testid={
          collapsed ? "collapsed-user-menu-trigger" : "user-menu-trigger"
        }
        aria-label={email}
        aria-expanded={open}
        onClick={handleToggle}
        className={
          collapsed
            ? sidebarNavRowClassName({ collapsed: true })
            : cn(
                dropdownTriggerShellClassName,
                "cursor-pointer",
                // Two lines (email + team) need more room than the one-line
                // control height the shell is sized for.
                teamName && "h-auto min-h-9 py-1.5",
              )
        }
      >
        {collapsed ? (
          <SidebarCollapsedIconSlot active={open}>
            <User width={ICON_SIZE} height={ICON_SIZE} />
          </SidebarCollapsedIconSlot>
        ) : (
          <>
            <span className="relative shrink-0">
              <User width={16} height={16} />
              {inviteCount > 0 ? (
                <span
                  data-testid="user-menu-invite-dot"
                  className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[var(--primary-500)]"
                />
              ) : null}
            </span>
            <span className="flex min-w-0 flex-col text-left leading-tight">
              <span className="truncate text-sm">{email}</span>
              {teamName ? (
                <span
                  data-testid="user-menu-team-name"
                  className="truncate text-xs text-[var(--oh-muted)]"
                >
                  {teamName}
                </span>
              ) : null}
            </span>
          </>
        )}
        {collapsed ? (
          <span className={sidebarNavLabelClassName(true)}>{email}</span>
        ) : null}
      </button>
      {open ? (
        <div
          className={
            collapsed
              ? "absolute bottom-0 left-full z-40 w-[240px] pl-2.5"
              : "absolute bottom-full left-0 z-40 mb-2 w-full"
          }
        >
          <ContextMenu ref={menuRef} testId="user-menu" theme="popover">
            <li className="truncate px-2 py-2 text-xs text-[var(--oh-muted)]">
              {email}
            </li>
            {(teams ?? []).length > 0 ? (
              <li className="px-2 pt-1 text-[11px] uppercase tracking-wide text-[var(--oh-muted)]">
                {t(I18nKey.TEAM$SWITCHER_LABEL)}
              </li>
            ) : null}
            {(teams ?? []).map((team) => (
              <ContextMenuListItem
                key={team.id}
                testId={`team-switch-${team.isPersonal ? "personal" : team.id}`}
                onClick={() => handleSwitch(team.id)}
                isDisabled={switchTeam.isPending}
              >
                <span className="flex w-4 shrink-0 justify-center">
                  {team.id === activeTeam?.id ? (
                    <Check width={14} height={14} />
                  ) : null}
                </span>
                <span className="truncate">
                  {team.isPersonal ? t(I18nKey.TEAM$PERSONAL_TITLE) : team.name}
                </span>
              </ContextMenuListItem>
            ))}
            <ContextMenuListItem
              testId="team-create-button"
              onClick={() => {
                setOpen(false);
                setIsCreatingTeam(true);
              }}
            >
              <Plus width={16} height={16} className="shrink-0" />
              {t(I18nKey.TEAM$CREATE_TITLE)}
            </ContextMenuListItem>
            <ContextMenuListItem
              testId="team-manage-button"
              onClick={handleOpenTeam}
            >
              <Users width={16} height={16} className="shrink-0" />
              <span className="truncate">{t(I18nKey.TEAM$MANAGE)}</span>
              {inviteCount > 0 ? (
                <span
                  data-testid="team-invite-count"
                  className="ml-auto rounded-full bg-[var(--primary-500)] px-1.5 text-[11px] text-[var(--oh-color-base)]"
                >
                  {inviteCount}
                </span>
              ) : null}
            </ContextMenuListItem>
            <ContextMenuListItem
              testId="sidebar-sign-out-button"
              onClick={handleSignOut}
              isDisabled={isSigningOut}
            >
              <LogOut width={16} height={16} className="shrink-0" />
              {t(I18nKey.SETTINGS$SIGN_OUT)}
            </ContextMenuListItem>
          </ContextMenu>
        </div>
      ) : null}
      {isCreatingTeam ? (
        <CreateTeamModal onClose={() => setIsCreatingTeam(false)} />
      ) : null}
    </div>
  );
}
