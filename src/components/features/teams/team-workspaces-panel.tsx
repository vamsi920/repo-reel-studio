import React from "react";
import { useTranslation } from "react-i18next";
import { Lock, Search, Users } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { teamRepository } from "#/lib/data-platform/repositories/team-repository";
import type { ActiveTeam } from "#/lib/data-platform/repositories/repository-identity";
import { useTeamMutation, useTeamWorkspaces } from "#/hooks/query/use-teams";
import { canManageTeam, hasRole } from "#/lib/teams/roles";
import type { TeamWorkspace } from "#/lib/teams/types";
import { formatDate } from "#/utils/format-relative-time";
import { TeamConfirmDialog } from "./team-confirm-dialog";
import { WorkspaceAccessModal } from "./workspace-access-modal";
import {
  ROLE_LABEL_KEY,
  VISIBILITY_LABEL_KEY,
  teamCardClassName,
  teamFieldClassName,
  teamMutedTextClassName,
} from "./team-labels";

/** Rows shown before "Show more". A busy team can have hundreds. */
const PAGE_SIZE = 25;

function workspaceLabel(workspace: TeamWorkspace): string {
  if (workspace.name) return workspace.name;
  const segments = workspace.path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? workspace.path;
}

interface TeamWorkspacesPanelProps {
  team: ActiveTeam;
}

/**
 * The folders and repositories this team works in, and who reaches each one.
 * A workspace appears here the first time someone opens it while this team is
 * active; this screen is where its name and access are managed.
 */
export function TeamWorkspacesPanel({ team }: TeamWorkspacesPanelProps) {
  const { t, i18n } = useTranslation("openhands");
  const { data: workspaces, isPending, isError } = useTeamWorkspaces(team.id);
  const [search, setSearch] = React.useState("");
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<TeamWorkspace | null>(null);

  const remove = useTeamMutation((workspaceId: string) =>
    teamRepository.deleteWorkspace(workspaceId),
  );

  const isTeamAdmin = canManageTeam(team.role);
  const query = search.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      (workspaces ?? []).filter(
        (workspace) =>
          !query ||
          workspaceLabel(workspace).toLowerCase().includes(query) ||
          workspace.path.toLowerCase().includes(query),
      ),
    [workspaces, query],
  );
  const visible = filtered.slice(0, limit);
  // Looked up from the live list, so the dialog reflects a change made in it.
  const editing = (workspaces ?? []).find((item) => item.id === editingId);

  return (
    <section
      data-testid="team-workspaces-panel"
      className="flex flex-col gap-4"
    >
      <p className={teamMutedTextClassName}>
        {team.isPersonal
          ? t(I18nKey.TEAM$WORKSPACES_HINT_PERSONAL)
          : t(I18nKey.TEAM$WORKSPACES_HINT)}
      </p>

      <label className="relative block max-w-sm">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
        />
        <input
          data-testid="workspace-search"
          type="search"
          aria-label={t(I18nKey.TEAM$WORKSPACES_SEARCH)}
          placeholder={t(I18nKey.TEAM$WORKSPACES_SEARCH)}
          className={`${teamFieldClassName} pl-8`}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setLimit(PAGE_SIZE);
          }}
        />
      </label>

      {isError ? (
        <p role="alert" className="text-sm text-red-500">
          {t(I18nKey.TEAM$LOAD_FAILED)}
        </p>
      ) : null}
      {isPending ? (
        <p className={teamMutedTextClassName}>{t(I18nKey.TEAM$LOADING)}</p>
      ) : null}
      {!isPending && !isError && filtered.length === 0 ? (
        <p
          data-testid="workspaces-empty"
          className={`${teamCardClassName} p-6 text-center ${teamMutedTextClassName}`}
        >
          {query
            ? t(I18nKey.TEAM$WORKSPACES_NO_MATCH)
            : t(I18nKey.TEAM$WORKSPACES_EMPTY)}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {visible.map((workspace) => {
          const canAdminister = hasRole(workspace.myRole, "admin");
          const canDelete = isTeamAdmin || workspace.myRole === "owner";
          return (
            <li
              key={workspace.id}
              data-testid="team-workspace-row"
              className={`${teamCardClassName} flex flex-wrap items-center justify-between gap-3 p-4`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {workspaceLabel(workspace)}
                </span>
                <span className="truncate font-mono text-xs text-[var(--text-secondary)]">
                  {workspace.path}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-[var(--text-secondary)]">
                  <span
                    data-testid="workspace-visibility"
                    className="flex items-center gap-1"
                  >
                    {workspace.visibility === "restricted" ? (
                      <Lock size={12} />
                    ) : (
                      <Users size={12} />
                    )}
                    {t(VISIBILITY_LABEL_KEY[workspace.visibility])}
                  </span>
                  {workspace.myRole ? (
                    <span>
                      {t(I18nKey.TEAM$WORKSPACE_YOUR_ROLE, {
                        role: t(ROLE_LABEL_KEY[workspace.myRole]),
                      })}
                    </span>
                  ) : null}
                  {workspace.updatedAt ? (
                    <span>
                      {t(I18nKey.TEAM$WORKSPACE_UPDATED, {
                        date: formatDate(workspace.updatedAt, i18n.language),
                      })}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <BrandButton
                  testId="workspace-manage-button"
                  type="button"
                  variant="secondary"
                  onClick={() => setEditingId(workspace.id)}
                >
                  {canAdminister
                    ? t(I18nKey.TEAM$WORKSPACE_MANAGE)
                    : t(I18nKey.TEAM$WORKSPACE_VIEW)}
                </BrandButton>
                {canDelete ? (
                  <BrandButton
                    testId="workspace-delete-button"
                    type="button"
                    variant="ghost-danger"
                    onClick={() => setDeleting(workspace)}
                  >
                    {t(I18nKey.BUTTON$DELETE)}
                  </BrandButton>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {filtered.length > visible.length ? (
        <div>
          <BrandButton
            testId="workspaces-show-more"
            type="button"
            variant="secondary"
            onClick={() => setLimit((current) => current + PAGE_SIZE)}
          >
            {t(I18nKey.TEAM$SHOW_MORE, {
              count: filtered.length - visible.length,
            })}
          </BrandButton>
        </div>
      ) : null}

      {editing ? (
        <WorkspaceAccessModal
          teamId={team.id}
          workspace={editing}
          isTeamAdmin={isTeamAdmin}
          onClose={() => setEditingId(null)}
        />
      ) : null}
      {deleting ? (
        <TeamConfirmDialog
          testId="workspace-delete-confirm"
          title={t(I18nKey.TEAM$WORKSPACE_DELETE_TITLE)}
          body={t(I18nKey.TEAM$WORKSPACE_DELETE_BODY, {
            name: workspaceLabel(deleting),
          })}
          confirmLabel={t(I18nKey.BUTTON$DELETE)}
          isDanger
          requireText={workspaceLabel(deleting)}
          requireTextLabel={t(I18nKey.TEAM$TYPE_TO_CONFIRM, {
            text: workspaceLabel(deleting),
          })}
          isBusy={remove.isPending}
          onConfirm={() =>
            remove.mutate(deleting.id, { onSettled: () => setDeleting(null) })
          }
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </section>
  );
}
