import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  useAgentOpsAudit,
  useAgentOpsRuns,
  useAgentOpsSummary,
} from "#/hooks/query/use-agentops";
import { useLiveElapsedTick } from "#/hooks/use-live-elapsed-tick";
import { AgentOpsPanel } from "#/components/features/agentops/agentops-panel";
import { AgentOpsStatTiles } from "#/components/features/agentops/agentops-stat-tiles";
import { AuditList } from "#/components/features/agentops/audit-list";
import { LiveRunsTable } from "#/components/features/agentops/live-runs-table";
import { LocalStoreBanner } from "#/components/features/agentops/local-store-banner";
import { ACTIVE_RUN_STATUSES_QUERY } from "#/components/features/agentops/agentops-formatting";

function AgentOpsOverview() {
  const { t } = useTranslation("openhands");
  const summary = useAgentOpsSummary();
  const activeRuns = useAgentOpsRuns({ status: ACTIVE_RUN_STATUSES_QUERY });
  const audit = useAgentOpsAudit();

  // The Live Runs preview below shows elapsed time, which is computed from
  // `Date.now()` at render time — tick while there's an active run to keep it
  // advancing even when a poll returns unchanged data (no re-render).
  useLiveElapsedTick((activeRuns.data ?? []).length > 0);

  return (
    // Every section below reads from a different query. Gating only on the
    // summary meant a slower `runs`/`audit` response rendered its section's
    // *empty* state — "no active runs" while runs were still loading — and an
    // audit failure showed as "no audit records" rather than the collector
    // being unreachable.
    //
    // `hasData` matters just as much here as it does on Approvals/Budgets:
    // this tab polls every 3s and every Fly deploy restarts the collector for
    // ~30s (see AGENTS.md INC-3), so without it a single failed background
    // poll swapped the whole Overview — stat tiles, live runs, recent
    // activity, all still showing the collector's own last real answer — for
    // the full-page "collector unavailable" card, on every deploy.
    <AgentOpsPanel
      isLoading={summary.isLoading || activeRuns.isLoading || audit.isLoading}
      error={summary.error ?? activeRuns.error ?? audit.error}
      hasData={Boolean(summary.data && activeRuns.data && audit.data)}
    >
      <div className="flex flex-col gap-6">
        {summary.data?.store === "jsonl" ? <LocalStoreBanner /> : null}
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
