import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  useAgentOpsAudit,
  useAgentOpsRuns,
  useAgentOpsSummary,
} from "#/hooks/query/use-agentops";
import { AgentOpsPanel } from "#/components/features/agentops/agentops-panel";
import { AgentOpsStatTiles } from "#/components/features/agentops/agentops-stat-tiles";
import { AuditList } from "#/components/features/agentops/audit-list";
import { LiveRunsTable } from "#/components/features/agentops/live-runs-table";

const ACTIVE_STATUSES = "running,paused,waiting_for_confirmation,stuck";

function AgentOpsOverview() {
  const { t } = useTranslation("openhands");
  const summary = useAgentOpsSummary();
  const activeRuns = useAgentOpsRuns({ status: ACTIVE_STATUSES });
  const audit = useAgentOpsAudit();

  return (
    <AgentOpsPanel
      isLoading={summary.isLoading}
      error={summary.error ?? activeRuns.error}
    >
      <div className="flex flex-col gap-6">
        {summary.data ? <AgentOpsStatTiles summary={summary.data} /> : null}

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {t(I18nKey.AGENTOPS$SECTION_LIVE_RUNS)}
            </h2>
            <Link
              to="/agentops/live"
              className="text-xs text-[var(--primary-500)] hover:underline"
            >
              {t(I18nKey.AGENTOPS$VIEW_ALL)}
            </Link>
          </div>
          <LiveRunsTable
            runs={activeRuns.data ?? []}
            emptyMessage={t(I18nKey.AGENTOPS$EMPTY_NO_ACTIVE_RUNS)}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {t(I18nKey.AGENTOPS$SECTION_RECENT_ACTIVITY)}
          </h2>
          <AuditList
            audit={(audit.data ?? []).slice(0, 15)}
            emptyMessage={t(I18nKey.AGENTOPS$EMPTY_NO_AUDIT)}
            showWorkspace
          />
        </section>
      </div>
    </AgentOpsPanel>
  );
}

export default AgentOpsOverview;
