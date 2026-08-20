import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useAgentOpsRuns } from "#/hooks/query/use-agentops";
import { AgentOpsPanel } from "#/components/features/agentops/agentops-panel";
import { LiveRunsTable } from "#/components/features/agentops/live-runs-table";

const ACTIVE_STATUSES = "running,paused,waiting_for_confirmation,stuck,idle";

function AgentOpsLiveRuns() {
  const { t } = useTranslation("openhands");
  const { data, isLoading, error } = useAgentOpsRuns({
    status: ACTIVE_STATUSES,
  });

  // Elapsed time is computed from `Date.now()`, so it needs its own tick — the
  // query itself only refetches when the collector has new data.
  const [, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <AgentOpsPanel isLoading={isLoading} error={error}>
      <LiveRunsTable
        runs={data ?? []}
        emptyMessage={t(I18nKey.AGENTOPS$EMPTY_START_A_TASK)}
      />
    </AgentOpsPanel>
  );
}

export default AgentOpsLiveRuns;
