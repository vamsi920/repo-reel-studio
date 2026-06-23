import { useCallback } from "react";

import {
  PROACTIVE_INSPECTOR_TABS,
  proactiveInspectorPanelId,
  proactiveInspectorTabId,
  type ProactiveInspectorTab,
} from "@/components/studio/agent-ops/proactive/proactiveInspectorTabs";
import { agentOpsFocusVisibleClass } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import { agentOpsTabBarClass, agentOpsTabTriggerClass } from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { agentOpsTransitionClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";
import { cn } from "@/lib/utils";

type ProactiveInspectorTabBarProps = {
  activeTab: ProactiveInspectorTab;
  onTabChange: (tab: ProactiveInspectorTab) => void;
};

export function ProactiveInspectorTabBar({ activeTab, onTabChange }: ProactiveInspectorTabBarProps) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, tab: ProactiveInspectorTab) => {
      const index = PROACTIVE_INSPECTOR_TABS.findIndex((entry) => entry.id === tab);
      if (index < 0) return;

      let nextIndex = index;
      switch (event.key) {
        case "ArrowRight":
          nextIndex = (index + 1) % PROACTIVE_INSPECTOR_TABS.length;
          break;
        case "ArrowLeft":
          nextIndex = (index - 1 + PROACTIVE_INSPECTOR_TABS.length) % PROACTIVE_INSPECTOR_TABS.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = PROACTIVE_INSPECTOR_TABS.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      onTabChange(PROACTIVE_INSPECTOR_TABS[nextIndex].id);
    },
    [onTabChange],
  );

  return (
    <div className="shrink-0 border-b border-white/[0.06] bg-white/[0.02]">
      <div
        className={cn(
          "flex items-stretch gap-0.5 overflow-x-auto overscroll-x-contain px-2 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5",
          agentOpsTabBarClass,
        )}
        role="tablist"
        aria-label="Candidate inspection sections"
        aria-orientation="horizontal"
      >
        {PROACTIVE_INSPECTOR_TABS.map(({ id, label }) => {
          const selected = activeTab === id;
          return (
            <button
              key={id}
              id={proactiveInspectorTabId(id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={proactiveInspectorPanelId(id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTabChange(id)}
              onKeyDown={(event) => handleKeyDown(event, id)}
              className={cn(
                agentOpsTabTriggerClass,
                agentOpsTransitionClass,
                agentOpsFocusVisibleClass,
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
