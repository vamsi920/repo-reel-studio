import { Link, useParams } from "react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useAgentOpsRun } from "#/hooks/query/use-agentops";
import { AgentOpsPanel } from "#/components/features/agentops/agentops-panel";
import { AuditList } from "#/components/features/agentops/audit-list";
import { ApprovalsQueue } from "#/components/features/agentops/approvals-queue";
import { RunControls } from "#/components/features/agentops/run-controls";
import { RunStatusBadge } from "#/components/features/agentops/run-status-badge";
import { RunTimeline } from "#/components/features/agentops/run-timeline";
import {
  formatCompactTokenCount,
  formatCostUsd,
  formatElapsed,
} from "#/components/features/agentops/agentops-formatting";

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
        {label}
      </span>
      <span className="text-sm font-medium text-[var(--text-primary)]">
        {value}
      </span>
    </div>
  );
}

function AgentOpsRunDetailScreen() {
  const { t } = useTranslation("openhands");
  const { runId } = useParams<{ runId: string }>();
  const { data, isLoading, error } = useAgentOpsRun(runId ?? null);

  return (
    <AgentOpsPanel isLoading={isLoading} error={error}>
      {data ? (
        <div data-testid="agentops-run-detail" className="flex flex-col gap-5">
          <Link
            to="/agentops/live"
            className="inline-flex w-fit items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={14} />
            {t(I18nKey.AGENTOPS$RUN_BACK)}
          </Link>

          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {data.run.task}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
                <RunStatusBadge status={data.run.status} />
                <span>{data.run.agentName}</span>
                <span className="font-mono">{data.run.workspaceId}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <RunControls run={data.run} />
              {/* The run *is* a conversation in the runtime — link straight to it. */}
              <Link
                to={`/conversations/${data.run.runId}`}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--background-secondary)]"
              >
                <ExternalLink size={14} />
                {t(I18nKey.AGENTOPS$RUN_OPEN_CONVERSATION)}
              </Link>
            </div>
          </header>

          <section className="grid grid-cols-2 gap-4 rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--background-primary)] p-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              label={t(I18nKey.AGENTOPS$COL_MODEL)}
              value={data.run.model ?? "—"}
            />
            <Stat
              label={t(I18nKey.AGENTOPS$COL_ELAPSED)}
              value={formatElapsed(data.run.startedAt, data.run.endedAt)}
            />
            <Stat
              label={t(I18nKey.AGENTOPS$RUN_TOKENS)}
              value={formatCompactTokenCount(data.run.tokens.total)}
            />
            <Stat
              label={t(I18nKey.AGENTOPS$COL_COST)}
              value={formatCostUsd(data.run.costUsd)}
            />
            <Stat
              label={t(I18nKey.AGENTOPS$RUN_TOOL_CALLS)}
              value={String(data.run.toolCallCount)}
            />
            <Stat
              label={t(I18nKey.AGENTOPS$RUN_LLM_CALLS)}
              value={String(data.run.llmCallCount)}
            />
          </section>

          {data.approvals.some((approval) => approval.state === "pending") ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {t(I18nKey.AGENTOPS$SECTION_WAITING_ON_YOU)}
              </h3>
              <ApprovalsQueue
                approvals={data.approvals.filter(
                  (approval) => approval.state === "pending",
                )}
                emptyMessage=""
              />
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {t(I18nKey.AGENTOPS$SECTION_TIMELINE)}
            </h3>
            <RunTimeline run={data.run} spans={data.spans} />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {t(I18nKey.AGENTOPS$SECTION_AUDIT)}
            </h3>
            <AuditList
              audit={data.audit}
              emptyMessage={t(I18nKey.AGENTOPS$EMPTY_NO_RUN_AUDIT)}
            />
          </section>
        </div>
      ) : null}
    </AgentOpsPanel>
  );
}

export default AgentOpsRunDetailScreen;
