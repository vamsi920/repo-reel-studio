import { useCallback } from "react";

import {
  RUN_DETAIL_TABS,
  runDetailPanelId,
  runDetailTabId,
  type RunDetailTab,
} from "@/components/studio/agent-ops/runs/runInspectorTabs";
import { agentOpsFocusVisibleClass } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import { agentOpsTransitionClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";
import { agentOpsTabBarClass, agentOpsTabTriggerClass } from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { cn } from "@/lib/utils";

type RunInspectorTabBarProps = {
  activeTab: RunDetailTab;
  onTabChange: (tab: RunDetailTab) => void;
};

export function RunInspectorTabBar({ activeTab, onTabChange }: RunInspectorTabBarProps) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, tab: RunDetailTab) => {
      const index = RUN_DETAIL_TABS.findIndex((entry) => entry.id === tab);
      if (index < 0) return;

      let nextIndex = index;
      switch (event.key) {
        case "ArrowRight":
          nextIndex = (index + 1) % RUN_DETAIL_TABS.length;
          break;
        case "ArrowLeft":
          nextIndex = (index - 1 + RUN_DETAIL_TABS.length) % RUN_DETAIL_TABS.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = RUN_DETAIL_TABS.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      onTabChange(RUN_DETAIL_TABS[nextIndex].id);
    },
    [onTabChange],
  );

  return (
    <div className="shrink-0 border-b border-white/[0.06] bg-white/[0.02]">
      <div
        className={cn(
          "flex items-stretch gap-0.5 overflow-x-auto overscroll-x-contain px-2 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15",
          agentOpsTabBarClass,
        )}
        role="tablist"
        aria-label="Run detail sections"
        aria-orientation="horizontal"
      >
        {RUN_DETAIL_TABS.map(({ id, label }) => {
          const selected = activeTab === id;
          return (
            <button
              key={id}
              id={runDetailTabId(id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={runDetailPanelId(id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTabChange(id)}
              onKeyDown={(event) => handleKeyDown(event, id)}
              className={cn(
                agentOpsTabTriggerClass,
                agentOpsTransitionClass,
                agentOpsFocusVisibleClass,
                "focus-visible:ring-offset-1",
                selected
                  ? "bg-white/[0.09] text-white shadow-[inset_0_-2px_0_0_hsl(var(--primary))]"
                  : "text-white/45 hover:bg-white/[0.04] hover:text-white/72",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
