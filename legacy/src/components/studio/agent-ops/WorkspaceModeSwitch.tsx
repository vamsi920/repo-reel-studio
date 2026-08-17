import { useCallback, useRef } from "react";

import { agentOpsFocusVisibleClass } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import { agentOpsTransitionClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";
import { AGENT_OPS_WORKSPACE_TABS, type AgentOpsWorkspaceTab } from "@/components/studio/agent-ops/types";
import { cn } from "@/lib/utils";

type WorkspaceModeSwitchProps = {
  value: AgentOpsWorkspaceTab;
  onChange: (tab: AgentOpsWorkspaceTab) => void;
  pendingReview: number;
  activeRunCount: number;
  proactiveReadyCount: number;
};

const TAB_META: Record<
  AgentOpsWorkspaceTab,
  {
    label: string;
    panelId: string;
    count: (props: WorkspaceModeSwitchProps) => number;
    countLabel: (count: number, props: WorkspaceModeSwitchProps) => string;
  }
> = {
  runs: {
    label: "Runs",
    panelId: "agent-ops-panel-runs",
    count: ({ pendingReview, activeRunCount }) => (pendingReview > 0 ? pendingReview : activeRunCount),
    countLabel: (count, { pendingReview, activeRunCount }) => {
      if (pendingReview > 0) {
        return `${count} awaiting review${activeRunCount > 0 ? `, ${activeRunCount} in progress` : ""}`;
      }
      if (activeRunCount > 0) return `${count} in progress`;
      return "no active runs";
    },
  },
  proactive: {
    label: "Proactive",
    panelId: "agent-ops-panel-proactive",
    count: ({ proactiveReadyCount }) => proactiveReadyCount,
    countLabel: (count) =>
      count > 0 ? `${count} ready · internal only` : "none ready · no PR until approve",
  },
};

export function WorkspaceModeSwitch(props: WorkspaceModeSwitchProps) {
  const { value, onChange } = props;
  const tabRefs = useRef<Partial<Record<AgentOpsWorkspaceTab, HTMLButtonElement | null>>>({});

  const focusTab = useCallback((tab: AgentOpsWorkspaceTab) => {
    tabRefs.current[tab]?.focus();
  }, []);

  const selectTab = useCallback(
    (tab: AgentOpsWorkspaceTab) => {
      onChange(tab);
      focusTab(tab);
    },
    [focusTab, onChange],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, tab: AgentOpsWorkspaceTab) => {
      const index = AGENT_OPS_WORKSPACE_TABS.indexOf(tab);
      if (index < 0) return;

      let nextIndex = index;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (index + 1) % AGENT_OPS_WORKSPACE_TABS.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = (index - 1 + AGENT_OPS_WORKSPACE_TABS.length) % AGENT_OPS_WORKSPACE_TABS.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = AGENT_OPS_WORKSPACE_TABS.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      const nextTab = AGENT_OPS_WORKSPACE_TABS[nextIndex];
      selectTab(nextTab);
    },
    [selectTab],
  );

  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1"
      role="tablist"
      aria-label="Agent Ops workspace"
      aria-orientation="horizontal"
    >
      {AGENT_OPS_WORKSPACE_TABS.map((tab) => {
        const { label, panelId, count, countLabel } = TAB_META[tab];
        const selected = value === tab;
        const tabCount = count(props);
        const tabId = `agent-ops-tab-${tab}`;
        const description = countLabel(tabCount, props);

        return (
          <button
            key={tab}
            ref={(node) => {
              tabRefs.current[tab] = node;
            }}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={(event) => handleKeyDown(event, tab)}
            className={cn(
              "relative flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-semibold sm:gap-2 sm:px-3 sm:text-sm",
              agentOpsTransitionClass,
              agentOpsFocusVisibleClass,
              selected
                ? "bg-background text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span>{label}</span>
            <span
              className={cn(
                "min-w-[1.35rem] rounded-md px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums leading-none",
                selected
                  ? tabCount > 0
                    ? "bg-primary/22 text-primary"
                    : "bg-muted text-muted-foreground"
                  : tabCount > 0
                    ? "bg-muted text-foreground/70"
                    : "bg-muted/60 text-muted-foreground",
              )}
              aria-hidden
            >
              {tabCount}
            </span>
            <span className="sr-only">{description}</span>
          </button>
        );
      })}
    </div>
  );
}
