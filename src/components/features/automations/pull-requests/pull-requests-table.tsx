import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { formatRelativeTime } from "#/utils/format-relative-time";
import type { NeodevexPullRequestWithAutomation } from "#/hooks/query/use-neodevex-pull-requests";
import { PullRequestStatusBadge } from "./pull-request-status-badge";

interface PullRequestsTableProps {
  pullRequests: NeodevexPullRequestWithAutomation[];
}

export function PullRequestsTable({ pullRequests }: PullRequestsTableProps) {
  const { t, i18n } = useTranslation("openhands");

  if (pullRequests.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="pull-requests-table"
      className="overflow-x-auto rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)]"
    >
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--oh-border)] text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">
              {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$COL_TITLE)}
            </th>
            <th className="px-4 py-3 font-medium">
              {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$COL_REPOSITORY)}
            </th>
            <th className="px-4 py-3 font-medium">
              {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$COL_AUTOMATION)}
            </th>
            <th className="px-4 py-3 font-medium">
              {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$COL_BRANCH)}
            </th>
            <th className="px-4 py-3 font-medium">
              {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$COL_STATUS)}
            </th>
            <th className="px-4 py-3 font-medium">
              {t(I18nKey.AUTOMATIONS$PULL_REQUESTS$COL_OPENED)}
            </th>
          </tr>
        </thead>
        <tbody>
          {pullRequests.map((pr) => (
            <tr
              key={pr.id}
              data-testid={`pull-request-row-${pr.id}`}
              className="border-b border-[var(--oh-border)] last:border-b-0 hover:bg-surface-raised"
            >
              <td className="max-w-[360px] px-4 py-3">
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-content hover:underline"
                >
                  <span className="truncate">{pr.title}</span>
                  <ExternalLink
                    className="size-3 shrink-0 text-muted"
                    aria-hidden
                  />
                </a>
                <div className="text-xs text-muted">#{pr.number}</div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-content">
                {pr.repository}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-content">
                {pr.automationLabel}
              </td>
              <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-muted">
                {pr.branch}
              </td>
              <td className="px-4 py-3">
                <PullRequestStatusBadge state={pr.state} isDraft={pr.isDraft} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-muted">
                {formatRelativeTime(pr.createdAt, i18n.language, t)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
