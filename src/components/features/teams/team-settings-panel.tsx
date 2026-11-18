import React from "react";
import { useTranslation } from "react-i18next";
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
  canLeaveTeam,
  canManageTeam,
  canOwnTeam,
  countOwners,
} from "#/lib/teams/roles";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";
import { TeamConfirmDialog } from "./team-confirm-dialog";
import {
  teamCardClassName,
  teamFieldClassName,
  teamMutedTextClassName,
} from "./team-labels";

interface TeamSettingsPanelProps {
  team: ActiveTeam;
  currentUserId: string;
  personalTeamId: string | null;
}

type Dialog = "transfer" | "leave" | "delete";

/** Where the app goes once the user is no longer in this team. */
async function leaveForPersonalTeam(personalTeamId: string | null) {
  if (personalTeamId) await switchActiveTeam(personalTeamId);
  else window.location.assign("/conversations");
}

export function TeamSettingsPanel({
  team,
  currentUserId,
  personalTeamId,
}: TeamSettingsPanelProps) {
  const { t } = useTranslation("openhands");
  const { data: members } = useTeamMembers(team.id);
  const [name, setName] = React.useState(team.name);
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  const [newOwnerId, setNewOwnerId] = React.useState("");

  React.useEffect(() => setName(team.name), [team.name]);

  const rename = useTeamMutation(async (nextName: string) => {
    await teamRepository.renameTeam(team.id, nextName);
    displaySuccessToast(t(I18nKey.TEAM$RENAMED));
  });
  const transfer = useTeamMutation((userId: string) =>
    teamRepository.transferOwnership(team.id, userId),
  );
  const leave = useTeamMutation(async () => {
    await teamRepository.leaveTeam(team.id);
    await leaveForPersonalTeam(personalTeamId);
  });
  const remove = useTeamMutation(async (confirmName: string) => {
    await teamRepository.deleteTeam(team.id, confirmName);
    await leaveForPersonalTeam(personalTeamId);
  });
  const isBusy =
    rename.isPending ||
    transfer.isPending ||
    leave.isPending ||
    remove.isPending;

  if (team.isPersonal) {
    return (
      <section
        data-testid="team-settings-panel"
        className={`${teamCardClassName} flex flex-col gap-2 p-5`}
      >
        <h2 className="text-sm font-medium text-[var(--text-primary)]">
          {t(I18nKey.TEAM$PERSONAL_TITLE)}
        </h2>
        <p className={teamMutedTextClassName}>
          {t(I18nKey.TEAM$PERSONAL_SETTINGS_HINT)}
        </p>
      </section>
    );
  }

  const canManage = canManageTeam(team.role);
  const isOwner = canOwnTeam(team.role);
  const ownerCount = countOwners(members ?? []);
  const others = (members ?? []).filter(
    (member) => member.userId !== currentUserId,
  );
  const trimmed = name.trim().replace(/\s+/g, " ");
  const canRename =
    canManage &&
    trimmed.length >= 2 &&
    trimmed.length <= 60 &&
    trimmed !== team.name;
  const newOwner = others.find((member) => member.userId === newOwnerId);

  return (
    <section data-testid="team-settings-panel" className="flex flex-col gap-4">
      <form
        className={`${teamCardClassName} flex flex-col gap-3 p-5`}
        onSubmit={(event) => {
          event.preventDefault();
          if (canRename && !isBusy) rename.mutate(trimmed);
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[var(--text-secondary)]">
            {t(I18nKey.TEAM$NAME_LABEL)}
          </span>
          <input
            data-testid="team-name-input"
            className={`${teamFieldClassName} max-w-md`}
            value={name}
            maxLength={60}
            disabled={!canManage || isBusy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {canManage ? (
          <div>
            <BrandButton
              testId="team-rename-submit"
              type="submit"
              variant="primary"
              isDisabled={!canRename || isBusy}
            >
              {t(I18nKey.BUTTON$SAVE)}
            </BrandButton>
          </div>
        ) : (
          <p className={teamMutedTextClassName}>
            {t(I18nKey.TEAM$ADMINS_ONLY)}
          </p>
        )}
      </form>

      {isOwner ? (
        <div className={`${teamCardClassName} flex flex-col gap-3 p-5`}>
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">
              {t(I18nKey.TEAM$TRANSFER_TITLE)}
            </h2>
            <p className={teamMutedTextClassName}>
              {t(I18nKey.TEAM$TRANSFER_HINT)}
            </p>
          </div>
          {others.length === 0 ? (
            <p className={teamMutedTextClassName}>
              {t(I18nKey.TEAM$TRANSFER_NOBODY)}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                data-testid="transfer-owner-select"
                aria-label={t(I18nKey.TEAM$TRANSFER_SELECT)}
                className={`${teamFieldClassName} w-auto min-w-[14rem] py-1.5`}
                value={newOwnerId}
                disabled={isBusy}
                onChange={(event) => setNewOwnerId(event.target.value)}
              >
                <option value="">{t(I18nKey.TEAM$TRANSFER_SELECT)}</option>
                {others.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.email ?? t(I18nKey.TEAM$UNKNOWN_MEMBER)}
                  </option>
                ))}
              </select>
              <BrandButton
                testId="transfer-owner-button"
                type="button"
                variant="secondary"
                isDisabled={!newOwner || isBusy}
                onClick={() => setDialog("transfer")}
              >
                {t(I18nKey.TEAM$TRANSFER_BUTTON)}
              </BrandButton>
            </div>
          )}
        </div>
      ) : null}

      <div
        className={`${teamCardClassName} flex flex-col gap-4 border-red-500/40 p-5`}
      >
        <h2 className="text-sm font-medium text-red-500">
          {t(I18nKey.TEAM$DANGER_ZONE)}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`${teamMutedTextClassName} max-w-xl`}>
            {canLeaveTeam(team.role, false, ownerCount)
              ? t(I18nKey.TEAM$LEAVE_HINT)
              : t(I18nKey.TEAM$LEAVE_BLOCKED_HINT)}
          </p>
          <BrandButton
            testId="leave-team-button"
            type="button"
            variant="secondary"
            isDisabled={!canLeaveTeam(team.role, false, ownerCount) || isBusy}
            onClick={() => setDialog("leave")}
          >
            {t(I18nKey.TEAM$LEAVE)}
          </BrandButton>
        </div>
        {isOwner ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--oh-border)] pt-4">
            <p className={`${teamMutedTextClassName} max-w-xl`}>
              {t(I18nKey.TEAM$DELETE_HINT)}
            </p>
            <BrandButton
              testId="delete-team-button"
              type="button"
              variant="danger"
              isDisabled={isBusy}
              onClick={() => setDialog("delete")}
            >
              {t(I18nKey.TEAM$DELETE_BUTTON)}
            </BrandButton>
          </div>
        ) : null}
      </div>

      {dialog === "transfer" && newOwner ? (
        <TeamConfirmDialog
          testId="transfer-confirm"
          title={t(I18nKey.TEAM$TRANSFER_TITLE)}
          body={t(I18nKey.TEAM$TRANSFER_BODY, {
            email: newOwner.email ?? t(I18nKey.TEAM$UNKNOWN_MEMBER),
            team: team.name,
          })}
          confirmLabel={t(I18nKey.TEAM$TRANSFER_BUTTON)}
          isBusy={isBusy}
          onConfirm={() =>
            transfer.mutate(newOwner.userId, {
              onSettled: () => {
                setDialog(null);
                setNewOwnerId("");
              },
            })
          }
          onCancel={() => setDialog(null)}
        />
      ) : null}
      {dialog === "leave" ? (
        <TeamConfirmDialog
          testId="leave-confirm"
          title={t(I18nKey.TEAM$LEAVE_TITLE)}
          body={t(I18nKey.TEAM$LEAVE_BODY, { team: team.name })}
          confirmLabel={t(I18nKey.TEAM$LEAVE)}
          isDanger
          isBusy={isBusy}
          onConfirm={() =>
            leave.mutate(undefined, { onSettled: () => setDialog(null) })
          }
          onCancel={() => setDialog(null)}
        />
      ) : null}
      {dialog === "delete" ? (
        <TeamConfirmDialog
          testId="delete-team-confirm"
          title={t(I18nKey.TEAM$DELETE_TITLE)}
          body={t(I18nKey.TEAM$DELETE_BODY, { team: team.name })}
          confirmLabel={t(I18nKey.TEAM$DELETE_BUTTON)}
          isDanger
          requireText={team.name}
          requireTextLabel={t(I18nKey.TEAM$TYPE_TO_CONFIRM, {
            text: team.name,
          })}
          isBusy={isBusy}
          onConfirm={(typed) =>
            remove.mutate(typed, { onSettled: () => setDialog(null) })
          }
          onCancel={() => setDialog(null)}
        />
      ) : null}
    </section>
  );
}
