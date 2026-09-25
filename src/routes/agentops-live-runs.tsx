import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useAgentOpsRuns } from "#/hooks/query/use-agentops";
import { useLiveElapsedTick } from "#/hooks/use-live-elapsed-tick";
import { AgentOpsPanel } from "#/components/features/agentops/agentops-panel";
import { LiveRunsTable } from "#/components/features/agentops/live-runs-table";
import { ACTIVE_RUN_STATUSES_QUERY } from "#/components/features/agentops/agentops-formatting";

function AgentOpsLiveRuns() {
  const { t } = useTranslation("openhands");
  const { data, isLoading, error } = useAgentOpsRuns({
    status: ACTIVE_RUN_STATUSES_QUERY,
  });

  // Elapsed time is computed from `Date.now()`, so it needs its own tick — the
  // query itself only refetches when the collector has new data.
  useLiveElapsedTick(true);

  return (
    // This is the tab someone has open while watching an agent work, polling
    // every 3s — exactly the surface a ~30s collector restart on every Fly
    // deploy (AGENTS.md INC-3) would otherwise flip to the full-page
    // "collector unavailable" card on top of an agent that is still running.
    // `hasData` keeps the table mounted with a stale banner instead.
    <AgentOpsPanel isLoading={isLoading} error={error} hasData={Boolean(data)}>
      <LiveRunsTable
        runs={data ?? []}
        emptyMessage={t(I18nKey.AGENTOPS$EMPTY_START_A_TASK)}
      />
    </AgentOpsPanel>
  );
}

export default AgentOpsLiveRuns;
