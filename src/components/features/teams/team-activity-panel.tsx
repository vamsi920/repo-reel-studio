import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { ActiveTeam } from "#/lib/data-platform/repositories/repository-identity";
import { useTeamAuditLog } from "#/hooks/query/use-teams";
import { canManageTeam, isTeamRole } from "#/lib/teams/roles";
import type { TeamAuditEntry } from "#/lib/teams/types";
import {
  AUDIT_ACTION_LABEL_KEY,
  ROLE_LABEL_KEY,
  teamCardClassName,
  teamMutedTextClassName,
} from "./team-labels";

interface TeamActivityPanelProps {
  team: ActiveTeam;
}

/** Who did what in the team, newest first. Owners and admins only. */
export function TeamActivityPanel({ team }: TeamActivityPanelProps) {
  const { t, i18n } = useTranslation("openhands");
  const canRead = canManageTeam(team.role);
  const {
    data: entries,
    isPending,
    isError,
  } = useTeamAuditLog(team.id, canRead);

  if (!canRead) {
    return (
      <p data-testid="activity-forbidden" className={teamMutedTextClassName}>
        {t(I18nKey.TEAM$ADMINS_ONLY)}
      </p>
    );
  }

  // A role name in the details reads better translated than as its raw value.
  const roleDetail = (entry: TeamAuditEntry): string | null => {
    const role = entry.metadata.to ?? entry.metadata.role;
    return isTeamRole(role) ? t(ROLE_LABEL_KEY[role]) : null;
  };

  const when = (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleString(i18n.language, {
          dateStyle: "medium",
          timeStyle: "short",
        });
  };

  return (
    <section data-testid="team-activity-panel" className="flex flex-col gap-4">
      <p className={teamMutedTextClassName}>{t(I18nKey.TEAM$ACTIVITY_HINT)}</p>
      {isError ? (
        <p role="alert" className="text-sm text-red-500">
          {t(I18nKey.TEAM$LOAD_FAILED)}
        </p>
      ) : null}
      {isPending ? (
        <p className={teamMutedTextClassName}>{t(I18nKey.TEAM$LOADING)}</p>
      ) : null}
      {!isPending && !isError && (entries ?? []).length === 0 ? (
        <p
          data-testid="activity-empty"
          className={`${teamCardClassName} p-6 text-center ${teamMutedTextClassName}`}
        >
          {t(I18nKey.TEAM$ACTIVITY_EMPTY)}
        </p>
      ) : null}
      <ol className={`${teamCardClassName} divide-y divide-[var(--oh-border)]`}>
        {(entries ?? []).map((entry) => {
          const labelKey = AUDIT_ACTION_LABEL_KEY[entry.action];
          const detail = roleDetail(entry);
          return (
            <li
              key={entry.id}
              data-testid="team-activity-row"
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"
            >
              <span className="min-w-0 text-[var(--text-primary)]">
                <span className="font-medium">
                  {labelKey ? t(labelKey) : entry.action}
                </span>
                {entry.targetLabel ? (
                  <span className="break-all text-[var(--text-secondary)]">
                    {" · "}
                    {entry.targetLabel}
                  </span>
                ) : null}
                {detail ? (
                  <span className="text-[var(--text-secondary)]">
                    {" · "}
                    {detail}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {entry.actorEmail
                  ? t(I18nKey.TEAM$ACTIVITY_BY, { actor: entry.actorEmail })
                  : null}
                {entry.actorEmail ? " · " : null}
                {when(entry.createdAt)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
