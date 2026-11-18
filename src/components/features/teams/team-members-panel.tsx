import React from "react";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { teamRepository } from "#/lib/data-platform/repositories/team-repository";
import type { ActiveTeam } from "#/lib/data-platform/repositories/repository-identity";
import {
  switchActiveTeam,
  useTeamMembers,
  useTeamMutation,
} from "#/hooks/query/use-teams";
import {
  assignableRoles,
  canLeaveTeam,
  canManageTeam,
  canRemoveMember,
  countOwners,
} from "#/lib/teams/roles";
import type { TeamMember, TeamRole } from "#/lib/teams/types";
import { formatDate } from "#/utils/format-relative-time";
import { InviteMembersModal } from "./invite-members-modal";
import { RoleSelect } from "./role-select";
import { TeamConfirmDialog } from "./team-confirm-dialog";
import {
  ROLE_LABEL_KEY,
  teamCardClassName,
  teamMutedTextClassName,
} from "./team-labels";

interface TeamMembersPanelProps {
  team: ActiveTeam;
  currentUserId: string;
  /** The user's personal team, where they land after leaving this one. */
  personalTeamId: string | null;
}

type Pending =
  | { kind: "role"; member: TeamMember; role: TeamRole }
  | { kind: "remove"; member: TeamMember }
  | { kind: "leave" };

export function TeamMembersPanel({
  team,
  currentUserId,
  personalTeamId,
}: TeamMembersPanelProps) {
  const { t, i18n } = useTranslation("openhands");
  const { data: members, isPending, isError } = useTeamMembers(team.id);
  const [isInviting, setIsInviting] = React.useState(false);
  const [pending, setPending] = React.useState<Pending | null>(null);

  const changeRole = useTeamMutation(
    (input: { userId: string; role: TeamRole }) =>
      teamRepository.updateMemberRole(team.id, input.userId, input.role),
  );
  const remove = useTeamMutation((userId: string) =>
    teamRepository.removeMember(team.id, userId),
  );
  const leave = useTeamMutation(async () => {
    await teamRepository.leaveTeam(team.id);
    if (personalTeamId) await switchActiveTeam(personalTeamId);
    else window.location.assign("/conversations");
  });
  const isBusy = changeRole.isPending || remove.isPending || leave.isPending;

  const ownerCount = countOwners(members ?? []);
  const canManage = canManageTeam(team.role);

  const requestRoleChange = (member: TeamMember, role: TeamRole) => {
    // Handing out ownership and lowering your own role both deserve a pause;
    // every other change is easy to reverse.
    const isSelf = member.userId === currentUserId;
    if (role === "owner" || isSelf) {
      setPending({ kind: "role", member, role });
      return;
    }
    changeRole.mutate({ userId: member.userId, role });
  };

  const confirmPending = () => {
    if (!pending) return;
    const done = { onSettled: () => setPending(null) };
    if (pending.kind === "role") {
      changeRole.mutate(
        { userId: pending.member.userId, role: pending.role },
        done,
      );
    } else if (pending.kind === "remove") {
      remove.mutate(pending.member.userId, done);
    } else {
      leave.mutate(undefined, done);
    }
  };

  const describePending = (): {
    title: string;
    body: string;
    label: string;
  } => {
    if (pending?.kind === "role") {
      const who = pending.member.email ?? t(I18nKey.TEAM$UNKNOWN_MEMBER);
      return {
        title: t(I18nKey.TEAM$CHANGE_ROLE_TITLE),
        body: t(I18nKey.TEAM$CHANGE_ROLE_BODY, {
          email: who,
          role: t(ROLE_LABEL_KEY[pending.role]),
        }),
        label: t(I18nKey.TEAM$CHANGE_ROLE_CONFIRM),
      };
    }
    if (pending?.kind === "remove") {
      return {
        title: t(I18nKey.TEAM$REMOVE_MEMBER_TITLE),
        body: t(I18nKey.TEAM$REMOVE_MEMBER_BODY, {
          email: pending.member.email ?? t(I18nKey.TEAM$UNKNOWN_MEMBER),
          team: team.name,
        }),
        label: t(I18nKey.TEAM$REMOVE),
      };
    }
    return {
      title: t(I18nKey.TEAM$LEAVE_TITLE),
      body: t(I18nKey.TEAM$LEAVE_BODY, { team: team.name }),
      label: t(I18nKey.TEAM$LEAVE),
    };
  };

  return (
    <section data-testid="team-members-panel" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={teamMutedTextClassName}>
          {t(I18nKey.TEAM$MEMBERS_COUNT, { count: members?.length ?? 0 })}
        </p>
        {canManage && !team.isPersonal ? (
          <BrandButton
            testId="invite-members-button"
            type="button"
            variant="primary"
            startContent={<UserPlus size={16} />}
            onClick={() => setIsInviting(true)}
          >
            {t(I18nKey.TEAM$INVITE_BUTTON)}
          </BrandButton>
        ) : null}
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-red-500">
          {t(I18nKey.TEAM$LOAD_FAILED)}
        </p>
      ) : null}

      <div className={`${teamCardClassName} overflow-x-auto`}>
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase text-[var(--text-secondary)]">
            <tr className="border-b border-[var(--oh-border)]">
              <th className="px-4 py-3 font-medium">
                {t(I18nKey.TEAM$COLUMN_MEMBER)}
              </th>
              <th className="px-4 py-3 font-medium">
                {t(I18nKey.TEAM$ROLE_LABEL)}
              </th>
              <th className="px-4 py-3 font-medium">
                {t(I18nKey.TEAM$COLUMN_JOINED)}
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-[var(--text-secondary)]"
                >
                  {t(I18nKey.TEAM$LOADING)}
                </td>
              </tr>
            ) : null}
            {(members ?? []).map((member) => {
              const isSelf = member.userId === currentUserId;
              const context = {
                actorRole: team.role,
                actorIsTarget: isSelf,
                targetRole: member.role,
                ownerCount,
              };
              const roles = team.isPersonal ? [] : assignableRoles(context);
              const label = member.email ?? t(I18nKey.TEAM$UNKNOWN_MEMBER);
              return (
                <tr
                  key={member.userId}
                  data-testid="team-member-row"
                  className="border-b border-[var(--oh-border)] last:border-b-0"
                >
                  <td className="px-4 py-3 text-[var(--text-primary)]">
                    <span className="break-all">{label}</span>
                    {isSelf ? (
                      <span className="ml-2 rounded-full bg-[var(--oh-interactive-hover)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                        {t(I18nKey.TEAM$YOU)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {roles.length > 0 ? (
                      <RoleSelect
                        testId="member-role-select"
                        ariaLabel={t(I18nKey.TEAM$ROLE_FOR, { email: label })}
                        value={member.role}
                        options={roles}
                        isDisabled={isBusy}
                        onChange={(role) => requestRoleChange(member, role)}
                      />
                    ) : (
                      <span
                        data-testid="member-role-label"
                        className="text-[var(--text-secondary)]"
                      >
                        {t(ROLE_LABEL_KEY[member.role])}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {member.joinedAt
                      ? formatDate(member.joinedAt, i18n.language)
                      : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!team.isPersonal && canRemoveMember(context) ? (
                      <BrandButton
                        testId="remove-member-button"
                        type="button"
                        variant="ghost-danger"
                        isDisabled={isBusy}
                        onClick={() => setPending({ kind: "remove", member })}
                      >
                        {t(I18nKey.TEAM$REMOVE)}
                      </BrandButton>
                    ) : null}
                    {isSelf &&
                    canLeaveTeam(team.role, team.isPersonal, ownerCount) ? (
                      <BrandButton
                        testId="leave-team-button"
                        type="button"
                        variant="ghost-danger"
                        isDisabled={isBusy}
                        onClick={() => setPending({ kind: "leave" })}
                      >
                        {t(I18nKey.TEAM$LEAVE)}
                      </BrandButton>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isInviting ? (
        <InviteMembersModal
          teamId={team.id}
          teamName={team.name}
          onClose={() => setIsInviting(false)}
        />
      ) : null}
      {pending ? (
        <TeamConfirmDialog
          testId="member-confirm"
          title={describePending().title}
          body={describePending().body}
          confirmLabel={describePending().label}
          isDanger={pending.kind !== "role"}
          isBusy={isBusy}
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </section>
  );
}
