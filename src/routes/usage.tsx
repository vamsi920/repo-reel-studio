import React from "react";
import { useTranslation } from "react-i18next";

import { I18nKey } from "#/i18n/declaration";
import {
  useUsageData,
  type UsageSelection,
} from "#/components/features/usage/use-usage-data";
import {
  MemoryHealthTab,
  UsageCostsTab,
  UsageOverviewTab,
  UsageSavingsTab,
  UsageTokensTab,
  WorkspaceActivityFeed,
} from "#/components/features/usage/usage-tabs";
import { UsageSection } from "#/components/features/usage/usage-stat";
import {
  UsageWorkspaceSelect,
  useUsageWorkspaceOptions,
} from "#/components/features/usage/usage-workspace-select";
import { useRealUsageRealtime } from "#/hooks/use-real-usage-realtime";
import useWorkspaceMemoryStore from "#/stores/workspace-memory-store";

const TABS = [
  "Overview",
  "Tokens",
  "Costs",
  "Savings",
  "Memory Health",
] as const;

type Tab = (typeof TABS)[number];

const SELECTED_WORKSPACE_KEY = "oh:usage-selected-workspace-id";

function getStoredSelection(): UsageSelection {
  if (typeof window === "undefined") return { all: true };
  try {
    const stored = window.sessionStorage.getItem(SELECTED_WORKSPACE_KEY);
    return stored ? { workspaceId: stored } : { all: true };
  } catch {
    return { all: true };
  }
}

function storeSelection(selection: UsageSelection): void {
  if (typeof window === "undefined") return;
  try {
    if ("workspaceId" in selection) {
      window.sessionStorage.setItem(
        SELECTED_WORKSPACE_KEY,
        selection.workspaceId,
      );
    } else {
      window.sessionStorage.removeItem(SELECTED_WORKSPACE_KEY);
    }
  } catch {
    // Session storage unavailable — the selection just won't survive a reload.
  }
}

/**
 * The only user-facing surface of workspace memory.
 *
 * Memory itself stays background infrastructure -- there is no "Memory" nav
 * item and nothing here asks the user to curate anything. This page answers
 * one question: what did the optimization actually do.
 *
 * Defaults to "all workspaces" so it never shows a blank page just because no
 * conversation happens to be open — this route has no active conversation to
 * derive a workspace from, unlike the rest of the app.
 */
export default function UsageRoute() {
  const { t } = useTranslation("openhands");
  const [tab, setTab] = React.useState<Tab>("Overview");
  const [selection, setSelection] = React.useState<UsageSelection>(() =>
    getStoredSelection(),
  );
  const { labelByWorkspaceId } = useUsageWorkspaceOptions();
  const data = useUsageData(selection);
  const activity = useWorkspaceMemoryStore((state) => state.activity);
  // Live cross-tab updates for whichever single workspace is selected -- a
  // second tab's usage shows up here without a reload.
  useRealUsageRealtime(data.workspaceId);

  const handleSelectionChange = React.useCallback((next: UsageSelection) => {
    setSelection(next);
    storeSelection(next);
  }, []);

  const workspaceActivity = React.useMemo(
    () =>
      data.workspaceId
        ? activity.filter((event) => event.workspaceId === data.workspaceId)
        : activity,
    [activity, data.workspaceId],
  );

  return (
    <div
      data-testid="usage-route"
      className="flex h-full flex-col gap-6 overflow-y-auto p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            {t(I18nKey.USAGE$PAGE_TITLE)}
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t(I18nKey.USAGE$PAGE_DESCRIPTION)}
          </p>
        </div>
        <UsageWorkspaceSelect
          selection={selection}
          onChange={handleSelectionChange}
        />
      </header>

      <nav className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            data-testid={`usage-tab-${name.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => setTab(name)}
            className={
              tab === name
                ? "border-b-2 border-neutral-900 px-3 py-2 text-sm font-medium text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
                : "border-b-2 border-transparent px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }
          >
            {name}
          </button>
        ))}
      </nav>

      {tab === "Overview" ? <UsageOverviewTab data={data} /> : null}
      {tab === "Tokens" ? <UsageTokensTab data={data} /> : null}
      {tab === "Costs" ? <UsageCostsTab data={data} /> : null}
      {tab === "Savings" ? <UsageSavingsTab data={data} /> : null}
      {tab === "Memory Health" ? (
        <MemoryHealthTab data={data} workspaceLabels={labelByWorkspaceId} />
      ) : null}

      <UsageSection
        title={t(I18nKey.USAGE$RECENT_MEMORY_UPDATES_TITLE)}
        description="What the memory updater has been doing in the background."
      >
        <WorkspaceActivityFeed events={workspaceActivity} />
      </UsageSection>
    </div>
  );
}
