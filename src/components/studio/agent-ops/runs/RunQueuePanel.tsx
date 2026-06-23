import { RefreshCw, Search } from "lucide-react";

import { RunQueueItem } from "@/components/studio/agent-ops/runs/RunQueueItem";
import { AgentOpsEmptyState } from "@/components/studio/agent-ops/shared/AgentOpsEmptyState";
import {
  AGENT_OPS_ACTION_LABEL,
  refreshDisabledReason,
} from "@/components/studio/agent-ops/shared/agentOpsActions";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { AgentOpsActionButton } from "@/components/studio/agent-ops/shared/AgentOpsActionButton";
import { agentOpsActionMinWidth } from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { cn } from "@/lib/utils";
import { AgentOpsPanel } from "@/components/studio/agent-ops/shared/AgentOpsPanel";
import { AgentOpsSectionHeader } from "@/components/studio/agent-ops/shared/AgentOpsSectionHeader";
import type { AgentRun } from "@/lib/agentRuns";
import { Input } from "@/components/ui/input";

const SEARCH_ID = "agent-ops-run-queue-search";

export type RunQueuePanelProps = {
  runs: AgentRun[];
  filteredRuns: AgentRun[];
  runFilter: string;
  selectedId: string | null;
  loadingRuns: boolean;
  syncingRuns: boolean;
  onRunFilterChange: (value: string) => void;
  onSelectRun: (runId: string) => void;
  onRefresh: () => void;
  onStartRun: () => void;
};

export function RunQueuePanel({
  runs,
  filteredRuns,
  runFilter,
  selectedId,
  loadingRuns,
  syncingRuns,
  onRunFilterChange,
  onSelectRun,
  onRefresh,
  onStartRun,
}: RunQueuePanelProps) {
  const queueBusy = loadingRuns || syncingRuns;
  const hasFilter = runFilter.trim().length > 0;
  const emptyAll = runs.length === 0;
  const emptyFiltered = !emptyAll && filteredRuns.length === 0;

  return (
    <AgentOpsPanel padding="md" variant="nested" className="flex min-w-0 flex-col">
      <AgentOpsSectionHeader
        title="Queue"
        compact
        trailing={
        <AgentOpsActionButton
          type="button"
          intent="tertiary"
          size="sm"
          className={cn("h-8 shrink-0 px-2 text-[11px]", agentOpsActionMinWidth.refreshWide)}
          onClick={onRefresh}
          disabled={queueBusy}
          disabledReason={refreshDisabledReason({ busy: queueBusy, scope: "runs" })}
          loading={queueBusy}
          loadingLabel={loadingRuns ? "Loading…" : "Syncing…"}
        >
          {!queueBusy ? <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
          {AGENT_OPS_ACTION_LABEL.refresh}
        </AgentOpsActionButton>
        }
      />

      <div className="relative mt-2.5 min-w-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/28" aria-hidden />
        <Input
          id={SEARCH_ID}
          className="h-9 min-w-0 pl-8 text-sm"
          value={runFilter}
          onChange={(event) => onRunFilterChange(event.target.value)}
          placeholder="Search title, id, status"
          aria-label="Filter runs"
        />
      </div>

      <div className="mt-2.5 min-w-0 flex-1">
        {emptyAll ? (
          <AgentOpsEmptyState
            title={AGENT_OPS_COPY.noRunsTitle}
            message={AGENT_OPS_COPY.noRunsMessage}
            action={{ label: AGENT_OPS_ACTION_LABEL.startRun, onClick: onStartRun, intent: "primary" }}
            compact
            className="text-center sm:text-left"
          />
        ) : emptyFiltered ? (
          <p className="rounded-lg border border-dashed border-white/[0.08] px-3 py-6 text-center text-xs leading-5 text-white/40">
            No match{hasFilter ? ` for “${runFilter.trim()}”` : ""}.
          </p>
        ) : (
          <ul
            className="max-h-[min(52vh,28rem)] min-w-0 divide-y divide-white/[0.06] overflow-y-auto overflow-x-hidden rounded-lg border border-white/[0.06] bg-black/10"
            aria-label="Run queue"
          >
            {filteredRuns.map((run) => (
              <RunQueueItem
                key={run.id}
                run={run}
                isSelected={run.id === selectedId}
                onSelect={onSelectRun}
              />
            ))}
          </ul>
        )}
      </div>

      {!emptyAll ? (
        <p className="mt-2 text-[10px] tabular-nums text-white/32">
          {filteredRuns.length} of {runs.length} shown
        </p>
      ) : null}
    </AgentOpsPanel>
  );
}
