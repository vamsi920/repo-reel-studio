import { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useAgentOpsApprovals } from "#/hooks/query/use-agentops";
import { AgentOpsPanel } from "#/components/features/agentops/agentops-panel";
import { ApprovalsQueue } from "#/components/features/agentops/approvals-queue";
import { cn } from "#/utils/utils";

const STATE_FILTERS = [
  { value: "pending", labelKey: I18nKey.AGENTOPS$FILTER_PENDING },
  { value: "all", labelKey: I18nKey.AGENTOPS$FILTER_ALL },
] as const;

function AgentOpsApprovals() {
  const { t } = useTranslation("openhands");
  const [state, setState] = useState<"pending" | "all">("pending");
  const { data, isLoading, error } = useAgentOpsApprovals(state);

  return (
    // Each pending card holds an operator-typed reason and, for a budget
    // breach, a headroom amount (see ApprovalCard in approvals-queue.tsx).
    // Approvals poll every 3s, so an unmounting swap to CollectorUnavailable
    // on the first failed poll would wipe whatever the operator was mid-typing;
    // pass `hasData` so a transient blip shows the stale banner instead, the
    // same fix agentops-budgets.tsx already applies to its own form.
    <AgentOpsPanel isLoading={isLoading} error={error} hasData={Boolean(data)}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {STATE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={state === filter.value}
              onClick={() => setState(filter.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors",
                state === filter.value
                  ? "bg-[var(--primary-500)] text-white"
                  : "border border-[var(--border-color)] text-[var(--text-secondary)]",
              )}
            >
              {t(filter.labelKey)}
            </button>
          ))}
        </div>
        <ApprovalsQueue
          approvals={data ?? []}
          emptyMessage={
            state === "pending"
              ? t(I18nKey.AGENTOPS$EMPTY_NO_PENDING_APPROVALS)
              : t(I18nKey.AGENTOPS$EMPTY_NO_APPROVALS)
          }
        />
      </div>
    </AgentOpsPanel>
  );
}

export default AgentOpsApprovals;
