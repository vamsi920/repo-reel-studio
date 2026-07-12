/** Stable layout dimensions for Agent Ops visual regression (Tailwind class fragments). */
export const agentOpsQueueRowClass =
  "min-h-[4.5rem] px-3 py-2.5";

export const agentOpsQueueTitleClass =
  "block min-h-[2.5rem] min-w-0 line-clamp-2 text-sm font-medium leading-snug text-foreground";

export const agentOpsQueueMetaClass =
  "block min-h-3 min-w-0 truncate font-mono text-[10px] leading-none text-muted-foreground";

export const agentOpsCandidateCardClass = "min-h-[12rem]";

export const agentOpsTabBarClass = "h-11 shrink-0";

export const agentOpsTabTriggerClass =
  "my-1.5 flex h-8 min-w-[3.25rem] shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2 text-xs font-medium sm:min-w-[4.25rem] sm:px-3 sm:text-sm";

export const agentOpsConsoleViewportClass = "h-32 min-h-32 max-h-32 shrink-0 overflow-hidden";

export const agentOpsConsoleEmptyClass =
  "flex h-32 min-h-32 max-h-32 items-center justify-center rounded-md border border-dashed border-border px-3";

export const agentOpsCodeViewportSmClass =
  "min-h-[9rem] max-h-36 overflow-y-auto overflow-x-hidden";

export const agentOpsCodeViewportLgClass =
  "min-h-[12rem] max-h-[min(56vh,28rem)] overflow-y-auto overflow-x-hidden";

export const agentOpsCodeShellClass =
  "min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-black/25";

export const agentOpsMetricCellStableClass = "min-h-[3.75rem]";

export const agentOpsMetricValueClass = "mt-1 flex min-h-5 items-center text-sm font-semibold tabular-nums leading-tight";

export const agentOpsMetricSubClass = "mt-0.5 block min-h-[0.875rem] text-[10px] leading-none text-muted-foreground";

export const agentOpsInspectorPanelClass = "min-h-[12rem]";

export const agentOpsStatusBlockClass = "min-h-[5.5rem]";

export const agentOpsModePillClass =
  "inline-flex min-w-[5.5rem] justify-center rounded-md border px-2 py-0.5 text-[11px] font-semibold";

export const agentOpsToggleStatusLabelClass =
  "inline-block min-w-[4.5rem] text-right text-[10px] font-medium text-muted-foreground";

export const agentOpsActionMinWidth = {
  startRun: "min-w-[7.5rem]",
  runScan: "min-w-[5.75rem]",
  refresh: "min-w-[5.5rem]",
  refreshWide: "min-w-[6.25rem]",
  approve: "min-w-[5.75rem]",
  dismiss: "min-w-[5.5rem]",
  openLinkedRun: "min-w-[7.5rem]",
  reject: "min-w-[5.25rem]",
  cancel: "min-w-[6.5rem]",
} as const;

/** Reference widths exercised in layout code (manual / VRT). */
export const AGENT_OPS_VRT_VIEWPORTS = [1280, 1440, 1920] as const;
