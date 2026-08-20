import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { AgentOpsRun } from "#/api/agentops-service/agentops-service.types";
import {
  RUN_PHASE_LABEL_KEYS,
  formatCostUsd,
  formatElapsed,
  phaseProgressPercent,
  shortWorkspace,
} from "./agentops-formatting";
import { RunStatusBadge } from "./run-status-badge";

interface LiveRunsTableProps {
  runs: AgentOpsRun[];
  emptyMessage: string;
  /** Elapsed is derived from `Date.now()`, so callers re-render on a timer. */
  showElapsed?: boolean;
}

export function LiveRunsTable({
  runs,
  emptyMessage,
  showElapsed = true,
}: LiveRunsTableProps) {
  const navigate = useNavigate();
  const { t } = useTranslation("openhands");

  if (!runs.length) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-color)] p-8 text-center text-sm text-[var(--text-secondary)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      data-testid="agentops-runs-table"
      className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--background-primary)]"
    >
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border-color)] text-left text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
            <th className="px-4 py-3 font-medium">
              {t(I18nKey.AGENTOPS$COL_AGENT)}
            </th>
            <th className="px-4 py-3 font-medium">
              {t(I18nKey.AGENTOPS$COL_TASK)}
            </th>
            <th className="px-4 py-3 font-medium">
              {t(I18nKey.AGENTOPS$COL_WORKSPACE)}
            </th>
            <th className="px-4 py-3 font-medium">
              {t(I18nKey.AGENTOPS$COL_STATUS)}
            </th>
            <th className="px-4 py-3 font-medium">
              {t(I18nKey.AGENTOPS$COL_PROGRESS)}
            </th>
            <th className="px-4 py-3 font-medium">
              {t(I18nKey.AGENTOPS$COL_MODEL)}
            </th>
            {showElapsed ? (
              <th className="px-4 py-3 font-medium">
                {t(I18nKey.AGENTOPS$COL_ELAPSED)}
              </th>
            ) : null}
            <th className="px-4 py-3 text-right font-medium">
              {t(I18nKey.AGENTOPS$COL_COST)}
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              key={run.runId}
              data-testid={`agentops-run-row-${run.runId}`}
              onClick={() => navigate(`/agentops/runs/${run.runId}`)}
              className="cursor-pointer border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--background-secondary)]"
            >
              <td className="whitespace-nowrap px-4 py-3 text-[var(--text-primary)]">
                {run.agentName}
              </td>
              <td className="max-w-[280px] truncate px-4 py-3 text-[var(--text-primary)]">
                {run.task}
              </td>
              <td
                className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]"
                title={run.workspaceId}
              >
                {shortWorkspace(run.workspaceId)}
              </td>
              <td className="px-4 py-3">
                <RunStatusBadge status={run.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex min-w-[140px] flex-col gap-1">
                  <span className="text-xs text-[var(--text-secondary)]">
                    {RUN_PHASE_LABEL_KEYS[run.phase]
                      ? t(RUN_PHASE_LABEL_KEYS[run.phase])
                      : run.phase}
                  </span>
                  <span className="h-1 w-full overflow-hidden rounded-full bg-[var(--background-tertiary)]">
                    <span
                      className="block h-full rounded-full bg-[var(--primary-500)]"
                      style={{ width: `${phaseProgressPercent(run.phase)}%` }}
                    />
                  </span>
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                {run.model ?? "—"}
              </td>
              {showElapsed ? (
                <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                  {formatElapsed(run.startedAt, run.endedAt)}
                </td>
              ) : null}
              <td className="whitespace-nowrap px-4 py-3 text-right text-[var(--text-primary)]">
                {formatCostUsd(run.costUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
