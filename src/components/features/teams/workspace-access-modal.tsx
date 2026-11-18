import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { teamRepository } from "#/lib/data-platform/repositories/team-repository";
import {
  useTeamMembers,
  useTeamMutation,
  useWorkspaceMembers,
} from "#/hooks/query/use-teams";
import { hasRole } from "#/lib/teams/roles";
import { INVITE_ROLES } from "#/lib/teams/types";
import type {
  InviteRole,
  TeamWorkspace,
  WorkspaceVisibility,
} from "#/lib/teams/types";
import { RoleSelect } from "./role-select";
import {
  ROLE_LABEL_KEY,
  VISIBILITY_HINT_KEY,
  VISIBILITY_LABEL_KEY,
  teamFieldClassName,
  teamMutedTextClassName,
} from "./team-labels";

const VISIBILITIES: WorkspaceVisibility[] = ["team", "restricted"];

interface WorkspaceAccessModalProps {
  teamId: string;
  workspace: TeamWorkspace;
  /** Whether the viewer is a team owner or admin (may remove an owner row). */
  isTeamAdmin: boolean;
  onClose: () => void;
}

/**
 * One workspace: its name, whether the whole team reaches it, and the people
 * granted access by name. Everything is read-only for someone who does not
 * administer the workspace.
 */
export function WorkspaceAccessModal({
  teamId,
  workspace,
  isTeamAdmin,
  onClose,
}: WorkspaceAccessModalProps) {
  const { t } = useTranslation("openhands");
  const canEdit = hasRole(workspace.myRole, "admin");
  const { data: grants } = useWorkspaceMembers(workspace.id);
  const { data: teamMembers } = useTeamMembers(teamId);

  const [name, setName] = React.useState(workspace.name ?? "");
  const [visibility, setVisibility] = React.useState(workspace.visibility);
  const [addUserId, setAddUserId] = React.useState("");
  const [addRole, setAddRole] = React.useState<InviteRole>("member");

  const save = useTeamMutation(
    (changes: { name?: string; visibility?: WorkspaceVisibility }) =>
      teamRepository.updateWorkspace(workspace.id, changes),
  );
  const grant = useTeamMutation((input: { userId: string; role: InviteRole }) =>
    teamRepository.setWorkspaceMember(workspace.id, input.userId, input.role),
  );
  const revoke = useTeamMutation((userId: string) =>
    teamRepository.removeWorkspaceMember(workspace.id, userId),
  );
  const isBusy = save.isPending || grant.isPending || revoke.isPending;

  const trimmedName = name.trim().replace(/\s+/g, " ");
  const nameChanged =
    trimmedName.length > 0 && trimmedName !== (workspace.name ?? "");
  const visibilityChanged = visibility !== workspace.visibility;

  const grantedIds = new Set((grants ?? []).map((member) => member.userId));
  const candidates = (teamMembers ?? []).filter(
    (member) => !grantedIds.has(member.userId),
  );

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || isBusy || (!nameChanged && !visibilityChanged)) return;
    save.mutate(
      {
        name: nameChanged ? trimmedName : undefined,
        visibility: visibilityChanged ? visibility : undefined,
      },
      { onSuccess: onClose },
    );
  };

  const title = t(I18nKey.TEAM$WORKSPACE_ACCESS_TITLE);

  return (
    <ModalBackdrop
      onClose={isBusy ? undefined : onClose}
      closeOnEscape={!isBusy}
      aria-label={title}
    >
      <div
        data-testid="workspace-access-modal"
        className="bg-base-secondary flex max-h-[85vh] w-[560px] max-w-[92vw] flex-col gap-5 overflow-y-auto rounded-xl border border-[var(--oh-border)] p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          <p
            className={`${teamMutedTextClassName} break-all font-mono text-xs`}
          >
            {workspace.path}
          </p>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--text-secondary)]">
              {t(I18nKey.TEAM$WORKSPACE_NAME_LABEL)}
            </span>
            <input
              data-testid="workspace-name-input"
              className={teamFieldClassName}
              value={name}
              maxLength={80}
              disabled={!canEdit || isBusy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <fieldset
            className="flex flex-col gap-2"
            disabled={!canEdit || isBusy}
          >
            <legend className="mb-1 text-sm text-[var(--text-secondary)]">
              {t(I18nKey.TEAM$WORKSPACE_VISIBILITY_LABEL)}
            </legend>
            {VISIBILITIES.map((option) => (
              <label
                key={option}
                className="grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg border border-[var(--oh-border)] p-3 text-sm"
              >
                <input
                  type="radio"
                  name="workspace-visibility"
                  data-testid={`workspace-visibility-${option}`}
                  className="row-span-2 mt-1"
                  checked={visibility === option}
                  onChange={() => setVisibility(option)}
                />
                <span className="text-[var(--text-primary)]">
                  {t(VISIBILITY_LABEL_KEY[option])}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {t(VISIBILITY_HINT_KEY[option])}
                </span>
              </label>
            ))}
          </fieldset>

          {canEdit ? (
            <div className="flex justify-end">
              <BrandButton
                testId="workspace-save"
                type="submit"
                variant="primary"
                isDisabled={isBusy || (!nameChanged && !visibilityChanged)}
              >
                {t(I18nKey.BUTTON$SAVE)}
              </BrandButton>
            </div>
          ) : null}
        </form>

        <div className="flex flex-col gap-3 border-t border-[var(--oh-border)] pt-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">
              {t(I18nKey.TEAM$WORKSPACE_PEOPLE_TITLE)}
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {t(I18nKey.TEAM$WORKSPACE_PEOPLE_HINT)}
            </p>
          </div>

          {(grants ?? []).length === 0 ? (
            <p className={teamMutedTextClassName}>
              {t(I18nKey.TEAM$WORKSPACE_PEOPLE_EMPTY)}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(grants ?? []).map((member) => {
                const label = member.email ?? t(I18nKey.TEAM$UNKNOWN_MEMBER);
                const isOwner = member.role === "owner";
                return (
                  <li
                    key={member.userId}
                    data-testid="workspace-member-row"
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="break-all text-[var(--text-primary)]">
                      {label}
                    </span>
                    <span className="flex items-center gap-2">
                      {canEdit && !isOwner ? (
                        <RoleSelect
                          testId="workspace-member-role"
                          ariaLabel={t(I18nKey.TEAM$ROLE_FOR, { email: label })}
                          value={member.role as InviteRole}
                          options={INVITE_ROLES}
                          isDisabled={isBusy}
                          onChange={(role) =>
                            grant.mutate({ userId: member.userId, role })
                          }
                        />
                      ) : (
                        <span className="text-[var(--text-secondary)]">
                          {t(ROLE_LABEL_KEY[member.role])}
                        </span>
                      )}
                      {canEdit && (!isOwner || isTeamAdmin) ? (
                        <BrandButton
                          testId="workspace-member-remove"
                          type="button"
                          variant="ghost-danger"
                          isDisabled={isBusy}
                          onClick={() => revoke.mutate(member.userId)}
                        >
                          {t(I18nKey.TEAM$REMOVE)}
                        </BrandButton>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {canEdit && candidates.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                data-testid="workspace-add-member"
                aria-label={t(I18nKey.TEAM$WORKSPACE_ADD_PERSON)}
                className={`${teamFieldClassName} w-auto min-w-[12rem] flex-1 py-1.5`}
                value={addUserId}
                disabled={isBusy}
                onChange={(event) => setAddUserId(event.target.value)}
              >
                <option value="">{t(I18nKey.TEAM$WORKSPACE_ADD_PERSON)}</option>
                {candidates.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.email ?? t(I18nKey.TEAM$UNKNOWN_MEMBER)}
                  </option>
                ))}
              </select>
              <RoleSelect
                testId="workspace-add-role"
                ariaLabel={t(I18nKey.TEAM$ROLE_LABEL)}
                value={addRole}
                options={INVITE_ROLES}
                isDisabled={isBusy}
                onChange={setAddRole}
              />
              <BrandButton
                testId="workspace-add-submit"
                type="button"
                variant="secondary"
                isDisabled={isBusy || !addUserId}
                onClick={() =>
                  grant.mutate(
                    { userId: addUserId, role: addRole },
                    { onSuccess: () => setAddUserId("") },
                  )
                }
              >
                {t(I18nKey.TEAM$WORKSPACE_ADD)}
              </BrandButton>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end">
          <BrandButton
            testId="workspace-access-close"
            type="button"
            variant="secondary"
            isDisabled={isBusy}
            onClick={onClose}
          >
            {t(I18nKey.BUTTON$CLOSE)}
          </BrandButton>
        </div>
      </div>
    </ModalBackdrop>
  );
}
