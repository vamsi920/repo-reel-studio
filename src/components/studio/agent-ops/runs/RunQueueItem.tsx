import { memo, useCallback } from "react";

import type { AgentRun } from "@/lib/agentRuns";
import { runStatusLabel } from "@/components/studio/agent-ops/runs/runStatusDisplay";
import { agentOpsFocusVisibleClass } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import {
  agentOpsQueueMetaClass,
  agentOpsQueueRowClass,
  agentOpsQueueTitleClass,
} from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { RunStatusBadge } from "@/components/studio/agent-ops/shared/AgentOpsStatusBadge";
import { fmtRelative } from "@/components/studio/agent-ops/shared/timeFormat";
import { agentOpsTransitionClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";
import { cn } from "@/lib/utils";

type RunQueueItemProps = {
  run: AgentRun;
  isSelected: boolean;
  onSelect: (runId: string) => void;
};

function RunQueueItemComponent({ run, isSelected, onSelect }: RunQueueItemProps) {
  const handleSelect = useCallback(() => {
    onSelect(run.id);
  }, [onSelect, run.id]);
  const title = run.issue?.title ?? run.issueUrl;
  const refLabel = run.issue?.number ? `#${run.issue.number}` : run.id.slice(0, 8);
  const idSuffix = run.issue?.number ? run.id.slice(0, 8) : null;
  const statusLabel = runStatusLabel(run.status);

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={handleSelect}
        aria-current={isSelected ? "true" : undefined}
        aria-label={`${title}, ${statusLabel}, ${refLabel}`}
        className={cn(
          "flex w-full min-w-0 flex-col gap-1 text-left",
          agentOpsTransitionClass,
          agentOpsQueueRowClass,
          agentOpsFocusVisibleClass,
          "focus-visible:ring-inset",
          isSelected ? "bg-white/[0.09]" : "hover:bg-white/[0.04]",
        )}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <RunStatusBadge status={run.status} variant="short" className="max-w-[58%] truncate" />
          <time
            className="shrink-0 text-[10px] font-medium tabular-nums text-white/36"
            dateTime={run.updatedAt}
            title={run.updatedAt}
          >
            {fmtRelative(run.updatedAt)}
          </time>
        </div>

        <span className={agentOpsQueueTitleClass}>{title}</span>

        <span className={agentOpsQueueMetaClass}>
          {refLabel}
          {idSuffix ? ` · ${idSuffix}` : null}
        </span>
      </button>
    </li>
  );
}

export const RunQueueItem = memo(RunQueueItemComponent);

