export type ProactiveInspectorTab = "overview" | "checks" | "log";

export const PROACTIVE_INSPECTOR_TABS: ReadonlyArray<{ id: ProactiveInspectorTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "checks", label: "Checks" },
  { id: "log", label: "Log" },
] as const;

export function proactiveInspectorTabId(tab: ProactiveInspectorTab) {
  return `proactive-inspector-tab-${tab}`;
}

export function proactiveInspectorPanelId(tab: ProactiveInspectorTab) {
  return `proactive-inspector-panel-${tab}`;
}
