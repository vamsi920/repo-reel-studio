import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useAgentOpsAudit, useAgentOpsRuns } from "#/hooks/query/use-agentops";
import { AgentOpsPanel } from "#/components/features/agentops/agentops-panel";
import { AuditList } from "#/components/features/agentops/audit-list";
import { LiveRunsTable } from "#/components/features/agentops/live-runs-table";

const FINISHED_STATUSES = "finished,error";

function AgentOpsHistory() {
  const { t } = useTranslation("openhands");
  const runs = useAgentOpsRuns({ status: FINISHED_STATUSES, live: false });
  const audit = useAgentOpsAudit();

  return (
    <AgentOpsPanel isLoading={runs.isLoading} error={runs.error}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {t(I18nKey.AGENTOPS$SECTION_COMPLETED_RUNS)}
          </h2>
          <LiveRunsTable
            runs={runs.data ?? []}
            emptyMessage={t(I18nKey.AGENTOPS$EMPTY_NO_COMPLETED_RUNS)}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {t(I18nKey.AGENTOPS$SECTION_AUDIT_LOG)}
          </h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            {t(I18nKey.AGENTOPS$AUDIT_NO_REASONING_NOTE)}
          </p>
          <AuditList
            audit={audit.data ?? []}
            emptyMessage={t(I18nKey.AGENTOPS$EMPTY_NO_AUDIT)}
            showWorkspace
          />
        </section>
      </div>
    </AgentOpsPanel>
  );
}

export default AgentOpsHistory;
