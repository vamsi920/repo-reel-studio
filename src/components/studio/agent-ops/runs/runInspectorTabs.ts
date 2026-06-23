export type RunDetailTab = "summary" | "patch" | "checks" | "ship" | "map";

export const RUN_DETAIL_TABS: ReadonlyArray<{ id: RunDetailTab; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "patch", label: "Patch" },
  { id: "checks", label: "Checks" },
  { id: "ship", label: "Ship" },
  { id: "map", label: "Map" },
] as const;

export function runDetailTabId(tab: RunDetailTab) {
  return `run-detail-tab-${tab}`;
}

export function runDetailPanelId(tab: RunDetailTab) {
  return `run-detail-panel-${tab}`;
}

/** Map legacy tab ids from deep links / older state. */
export function normalizeRunDetailTab(tab: string | null | undefined): RunDetailTab {
  switch (tab) {
    case "overview":
      return "summary";
    case "diff":
      return "patch";
    case "validation":
    case "tests":
    case "quality":
      return "checks";
    case "pr":
    case "fixstory":
      return "ship";
    case "mission":
      return "map";
    case "summary":
    case "patch":
    case "checks":
    case "ship":
    case "map":
      return tab;
    default:
      return "summary";
  }
}
