import React from "react";
import { useTranslation } from "react-i18next";

import { I18nKey } from "#/i18n/declaration";
import { formatCompactTokenCount } from "#/utils/format-token-count";

import type { UsageData } from "./use-usage-data";
import {
  formatCount,
  formatPercent,
  formatRelativeTime,
  formatUsd,
  UNKNOWN,
} from "./usage-format";
import {
  UsageEmptyState,
  UsageSection,
  UsageStat,
  UsageStatGrid,
} from "./usage-stat";

const NO_DATA =
  "Nothing measured yet. Numbers appear once memory has been used to build context for a message.";

/** Shown wherever a cost column is blank because a model has no known price. */
function UnpricedNote({ show }: { show: boolean }) {
  const { t } = useTranslation("openhands");
  if (!show) return null;
  return (
    <p className="text-xs text-neutral-500 dark:text-neutral-400">
      {t(I18nKey.USAGE$UNPRICED_NOTE)}
    </p>
  );
}

export function UsageOverviewTab({ data }: { data: UsageData }) {
  const { t } = useTranslation("openhands");
  const { thisMonth, health } = data;
  if (thisMonth.samples === 0) return <UsageEmptyState message={NO_DATA} />;

  return (
    <div className="flex flex-col gap-6">
      <UsageSection
        title={t(I18nKey.USAGE$THIS_MONTH_TITLE)}
        description="Measured across every context this workspace built."
      >
        <UsageStatGrid>
          <UsageStat
            label={t(I18nKey.USAGE$TOKENS_USED_LABEL)}
            value={formatCompactTokenCount(thisMonth.tokensUsed)}
            hint="Context actually sent"
          />
          <UsageStat
            label={t(I18nKey.USAGE$TOKENS_AVOIDED_LABEL)}
            value={formatCompactTokenCount(thisMonth.tokensAvoided)}
            hint="Dropped by selection and compression"
          />
          <UsageStat
            label={t(I18nKey.USAGE$ESTIMATED_COST_LABEL)}
            value={formatUsd(thisMonth.costWithOptimization)}
          />
          <UsageStat
            label={t(I18nKey.USAGE$ESTIMATED_COST_AVOIDED_LABEL)}
            value={formatUsd(thisMonth.estimatedCostAvoided)}
          />
        </UsageStatGrid>
        <UnpricedNote show={thisMonth.hasUnpricedSamples} />
      </UsageSection>

      <UsageSection title={t(I18nKey.USAGE$MEMORY_AT_A_GLANCE_TITLE)}>
        <UsageStatGrid>
          <UsageStat
            label={t(I18nKey.USAGE$WORKSPACE_MEMORIES_LABEL)}
            value={formatCount(health.total)}
          />
          <UsageStat
            label={t(I18nKey.USAGE$CONFLICTS_LABEL)}
            value={formatCount(health.conflicted)}
          />
          <UsageStat
            label={t(I18nKey.USAGE$CACHE_HIT_RATE_LABEL)}
            value={formatPercent(thisMonth.cacheHitRate)}
          />
          <UsageStat
            label={t(I18nKey.USAGE$RETRIEVALS_LABEL)}
            value={formatCount(thisMonth.retrievalCount)}
          />
        </UsageStatGrid>
      </UsageSection>
    </div>
  );
}

export function UsageTokensTab({ data }: { data: UsageData }) {
  const { t } = useTranslation("openhands");
  const { allTime, thisMonth } = data;
  if (allTime.samples === 0) return <UsageEmptyState message={NO_DATA} />;

  return (
    <div className="flex flex-col gap-6">
      <UsageSection
        title={t(I18nKey.USAGE$CONTEXT_TOKENS_TITLE)}
        description="Every context build records what it considered, what it selected, and what it sent."
      >
        <UsageStatGrid>
          <UsageStat
            label={t(I18nKey.USAGE$SENT_THIS_MONTH_LABEL)}
            value={formatCompactTokenCount(thisMonth.tokensUsed)}
          />
          <UsageStat
            label={t(I18nKey.USAGE$SENT_ALL_TIME_LABEL)}
            value={formatCompactTokenCount(allTime.tokensUsed)}
          />
          <UsageStat
            label={t(I18nKey.USAGE$AVOIDED_ALL_TIME_LABEL)}
            value={formatCompactTokenCount(allTime.tokensAvoided)}
          />
          <UsageStat
            label={t(I18nKey.USAGE$REUSED_FROM_CACHE_LABEL)}
            value={formatCompactTokenCount(allTime.cachedTokensReused)}
            hint="Context rebuilt for free"
          />
        </UsageStatGrid>
      </UsageSection>
    </div>
  );
}

export function UsageCostsTab({ data }: { data: UsageData }) {
  const { t } = useTranslation("openhands");
  const { allTime, thisMonth } = data;
  if (allTime.samples === 0) return <UsageEmptyState message={NO_DATA} />;

  const rows: Array<{ label: string; summary: typeof allTime }> = [
    { label: "This month", summary: thisMonth },
    { label: "All time", summary: allTime },
  ];

  return (
    <UsageSection
      title={t(I18nKey.USAGE$ESTIMATED_COST_LABEL)}
      description="Derived from measured input tokens and published per-model pricing. Output tokens are billed by the agent-server and are not attributed here."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              <th className="py-2 pr-4 font-medium">
                {t(I18nKey.USAGE$PERIOD_COLUMN)}
              </th>
              <th className="py-2 pr-4 font-medium">
                {t(I18nKey.USAGE$WITH_OPTIMIZATION_COLUMN)}
              </th>
              <th className="py-2 pr-4 font-medium">
                {t(I18nKey.USAGE$WITHOUT_OPTIMIZATION_COLUMN)}
              </th>
              <th className="py-2 font-medium">
                {t(I18nKey.USAGE$AVOIDED_COLUMN)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, summary }) => (
              <tr
                key={label}
                className="border-t border-neutral-200 dark:border-neutral-800"
              >
                <td className="py-2 pr-4">{label}</td>
                <td className="py-2 pr-4 tabular-nums">
                  {formatUsd(summary.costWithOptimization)}
                </td>
                <td className="py-2 pr-4 tabular-nums">
                  {formatUsd(summary.costWithoutOptimization)}
                </td>
                <td className="py-2 tabular-nums">
                  {formatUsd(summary.estimatedCostAvoided)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <UnpricedNote show={allTime.hasUnpricedSamples} />
    </UsageSection>
  );
}

export function UsageSavingsTab({ data }: { data: UsageData }) {
  const { t } = useTranslation("openhands");
  const { allTime } = data;
  if (allTime.samples === 0) return <UsageEmptyState message={NO_DATA} />;

  return (
    <div className="flex flex-col gap-6">
      <UsageSection
        title={t(I18nKey.USAGE$SAVINGS_SOURCE_TITLE)}
        description="Selection drops what the task does not need; compression shortens the prose that survives, never the code, paths, URLs or commands."
      >
        <UsageStatGrid>
          <UsageStat
            label={t(I18nKey.USAGE$AVERAGE_COMPRESSION_LABEL)}
            value={formatPercent(allTime.averageCompressionRatio, 1)}
            hint="Of the rendered block"
          />
          <UsageStat
            label={t(I18nKey.USAGE$CACHE_HIT_RATE_LABEL)}
            value={formatPercent(allTime.cacheHitRate)}
          />
          <UsageStat
            label={t(I18nKey.USAGE$TOKENS_AVOIDED_LABEL)}
            value={formatCompactTokenCount(allTime.tokensAvoided)}
          />
          <UsageStat
            label={t(I18nKey.USAGE$COST_AVOIDED_LABEL)}
            value={formatUsd(allTime.estimatedCostAvoided)}
          />
        </UsageStatGrid>
        <UnpricedNote show={allTime.hasUnpricedSamples} />
      </UsageSection>
    </div>
  );
}

export function MemoryHealthTab({
  data,
  workspaceLabels = {},
}: {
  data: UsageData;
  /** Display names for the `byWorkspace` breakdown, keyed by workspace id. */
  workspaceLabels?: Record<string, string>;
}) {
  const { t } = useTranslation("openhands");
  const { health, workspaceId } = data;
  const isAllWorkspaces = workspaceId === null;

  if (!isAllWorkspaces && health.total === 0) {
    return (
      <UsageEmptyState message="No memory recorded in this workspace yet. It fills in as agents work here." />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <UsageSection title={t(I18nKey.USAGE$MEMORY_HEALTH_TITLE)}>
        <UsageStatGrid>
          <UsageStat
            label={t(I18nKey.USAGE$WORKSPACE_MEMORIES_LABEL)}
            value={formatCount(health.total)}
          />
          <UsageStat
            label={t(I18nKey.USAGE$VALIDATED_LABEL)}
            value={formatCount(health.validated)}
            hint="Grounded in a checkable source"
          />
          <UsageStat
            label={t(I18nKey.USAGE$CONFLICTS_LABEL)}
            value={formatCount(health.conflicted)}
          />
          <UsageStat
            label={t(I18nKey.USAGE$STALE_REPOSITORY_MEMORIES_LABEL)}
            value={formatCount(health.staleRepositoryMemories)}
            hint="Recorded at an older commit"
          />
        </UsageStatGrid>
      </UsageSection>

      <UsageSection
        title={t(I18nKey.USAGE$DURABLE_COPY_TITLE)}
        description="Memory is written to the workspace itself, which needs a running conversation. Anything not yet written is listed here rather than assumed saved."
      >
        <UsageStatGrid>
          <UsageStat
            label={t(I18nKey.USAGE$WAITING_TO_BE_WRITTEN_LABEL)}
            value={formatCount(health.pendingMirror)}
          />
          {isAllWorkspaces ? null : (
            <UsageStat
              label={t(I18nKey.USAGE$LAST_WRITE_LABEL)}
              value={
                health.lastMirror
                  ? formatRelativeTime(health.lastMirror.at)
                  : UNKNOWN
              }
              hint={
                health.lastMirror?.error
                  ? `Failed: ${health.lastMirror.error}`
                  : health.lastMirror
                    ? `${health.lastMirror.flushed} record(s)`
                    : "No write attempted yet"
              }
            />
          )}
        </UsageStatGrid>
      </UsageSection>

      {isAllWorkspaces && health.byWorkspace.length > 0 ? (
        <UsageSection
          title={t(I18nKey.USAGE$BY_WORKSPACE_TITLE)}
          description="Counts only — open a specific workspace to see conflicting record text."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  <th className="py-2 pr-4 font-medium">
                    {t(I18nKey.USAGE$WORKSPACE_COLUMN)}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t(I18nKey.USAGE$MEMORIES_COLUMN)}
                  </th>
                  <th className="py-2 pr-4 font-medium">
                    {t(I18nKey.USAGE$CONFLICTS_LABEL)}
                  </th>
                  <th className="py-2 font-medium">
                    {t(I18nKey.USAGE$PENDING_WRITE_COLUMN)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {health.byWorkspace.map((row) => (
                  <tr
                    key={row.workspaceId}
                    className="border-t border-neutral-200 dark:border-neutral-800"
                  >
                    <td className="py-2 pr-4">
                      {workspaceLabels[row.workspaceId] ?? row.workspaceId}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {formatCount(row.total)}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {formatCount(row.conflicted)}
                    </td>
                    <td className="py-2 tabular-nums">
                      {formatCount(row.pendingMirror)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </UsageSection>
      ) : null}

      {!isAllWorkspaces && health.conflicts.length > 0 ? (
        <UsageSection
          title={t(I18nKey.USAGE$CONFLICTING_RECORDS_TITLE)}
          description="Sources disagree and none could be preferred. Both sides are shown to the agent; resolve them by stating the answer explicitly."
        >
          <ul className="flex flex-col gap-3">
            {health.conflicts.map(({ record, peers }) => (
              <li
                key={record.id}
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40"
              >
                <div className="font-medium text-neutral-900 dark:text-neutral-100">
                  {record.subject}
                </div>
                <div className="mt-1 text-neutral-700 dark:text-neutral-300">
                  {record.statement}
                </div>
                {peers.map((peer) => (
                  <div
                    key={peer.id}
                    className="mt-1 text-neutral-700 dark:text-neutral-300"
                  >
                    {t(I18nKey.USAGE$VS_PREFIX)} {peer.statement}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </UsageSection>
      ) : null}
    </div>
  );
}

export function WorkspaceActivityFeed({
  events,
}: {
  events: Array<{ id: string; at: string; summary: string }>;
}) {
  if (events.length === 0) {
    return <UsageEmptyState message="No memory activity recorded yet." />;
  }
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex items-baseline justify-between gap-4 border-b border-neutral-200 pb-2 last:border-0 dark:border-neutral-800"
        >
          <span className="text-neutral-700 dark:text-neutral-300">
            {event.summary}
          </span>
          <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
            {formatRelativeTime(event.at)}
          </span>
        </li>
      ))}
    </ul>
  );
}
