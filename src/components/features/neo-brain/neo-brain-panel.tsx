import React from "react";
import { useTranslation } from "react-i18next";

import {
  readRecords,
  subscribeWorkspaceMemory,
} from "#/api/workspace-memory/workspace-memory-store.api";
import { I18nKey } from "#/i18n/declaration";
import {
  BRAIN_LAYERS,
  KIND_TO_LAYER,
  type BrainLayer,
} from "#/lib/neo-brain/types";
import type { MemoryRecord } from "#/lib/workspace-memory/types";
import {
  approvePending,
  consolidateWorkspace,
  dismissPending,
} from "#/services/neo-brain";
import { useNeoBrainStore } from "#/stores/neo-brain-store";
import {
  UsageSection,
  UsageStat,
  UsageStatGrid,
} from "#/components/features/usage/usage-stat";

const LAYER_LABELS: Record<BrainLayer, I18nKey> = {
  gate: I18nKey.NEO_BRAIN$LAYER_GATE,
  decision: I18nKey.NEO_BRAIN$LAYER_DECISION,
  policy: I18nKey.NEO_BRAIN$LAYER_POLICY,
  convention: I18nKey.NEO_BRAIN$LAYER_CONVENTION,
  skill: I18nKey.NEO_BRAIN$LAYER_SKILL,
  failure: I18nKey.NEO_BRAIN$LAYER_FAILURE,
  fact: I18nKey.NEO_BRAIN$LAYER_FACT,
};

const MAX_PER_LAYER = 8;
const EMPTY_RECORDS: MemoryRecord[] = [];
const EMPTY_PENDING: never[] = [];

function useWorkspaceRecords(workspaceId: string): MemoryRecord[] {
  const snapshot = React.useRef<MemoryRecord[]>(EMPTY_RECORDS);
  const subscribe = React.useCallback(
    (callback: () => void) => subscribeWorkspaceMemory(workspaceId, callback),
    [workspaceId],
  );
  const getSnapshot = React.useCallback(() => {
    const next = readRecords(workspaceId);
    // Same content -> same reference, or useSyncExternalStore loops.
    if (JSON.stringify(next) !== JSON.stringify(snapshot.current)) {
      snapshot.current = next;
    }
    return snapshot.current;
  }, [workspaceId]);
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function formatWhen(iso: string | undefined, fallback: string): string {
  if (!iso) return fallback;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toLocaleString();
}

/**
 * What Neo Brain knows about one workspace, grouped by layer, plus the review
 * gate for corrections Neo inferred rather than was told.
 */
export function NeoBrainPanel({ workspaceId }: { workspaceId: string | null }) {
  const { t } = useTranslation("openhands");

  if (!workspaceId) {
    return (
      <p
        data-testid="neo-brain-pick-workspace"
        className="text-sm text-[var(--text-secondary)]"
      >
        {t(I18nKey.NEO_BRAIN$PICK_WORKSPACE)}
      </p>
    );
  }
  return <WorkspaceBrain workspaceId={workspaceId} />;
}

function WorkspaceBrain({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation("openhands");
  const records = useWorkspaceRecords(workspaceId);
  const pending = useNeoBrainStore(
    (state) => state.pending[workspaceId] ?? EMPTY_PENDING,
  );
  const lastConsolidated = useNeoBrainStore(
    (state) => state.lastConsolidatedAt[workspaceId],
  );

  const live = records.filter((record) => record.status !== "superseded");
  const reinforced = live.filter((record) =>
    record.tags.includes("reinforced"),
  ).length;
  const byLayer = new Map<BrainLayer, MemoryRecord[]>();
  live.forEach((record) => {
    const layer = KIND_TO_LAYER[record.kind] ?? "fact";
    byLayer.set(layer, [...(byLayer.get(layer) ?? []), record]);
  });

  return (
    <div data-testid="neo-brain-panel" className="flex flex-col gap-6">
      <UsageSection
        title={t(I18nKey.NEO_BRAIN$TITLE)}
        description={t(I18nKey.NEO_BRAIN$DESCRIPTION)}
      >
        <UsageStatGrid>
          <UsageStat
            label={t(I18nKey.NEO_BRAIN$LEARNED_LABEL)}
            value={String(live.length)}
          />
          <UsageStat
            label={t(I18nKey.NEO_BRAIN$REVIEW_LABEL)}
            value={String(pending.length)}
          />
          <UsageStat
            label={t(I18nKey.NEO_BRAIN$REINFORCED_LABEL)}
            value={String(reinforced)}
            hint={t(I18nKey.NEO_BRAIN$REINFORCED_HINT)}
          />
          <UsageStat
            label={t(I18nKey.NEO_BRAIN$LAST_CONSOLIDATED_LABEL)}
            value={formatWhen(lastConsolidated, t(I18nKey.NEO_BRAIN$NOT_YET))}
          />
        </UsageStatGrid>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--text-secondary)]">
            {t(I18nKey.NEO_BRAIN$MAP_HINT)}
          </p>
          <button
            type="button"
            data-testid="neo-brain-consolidate"
            onClick={() => consolidateWorkspace(workspaceId, { force: true })}
            className="rounded-md border border-[var(--border-color)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
          >
            {t(I18nKey.NEO_BRAIN$CONSOLIDATE_NOW)}
          </button>
        </div>
      </UsageSection>

      {pending.length > 0 ? (
        <UsageSection
          title={t(I18nKey.NEO_BRAIN$REVIEW_TITLE)}
          description={t(I18nKey.NEO_BRAIN$REVIEW_DESCRIPTION)}
        >
          <ul className="flex flex-col gap-2">
            {pending.map((learning) => (
              <li
                key={learning.id}
                data-testid="neo-brain-pending-item"
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-[var(--border-color)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-primary)]">
                    {learning.candidate.statement}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {t(I18nKey.NEO_BRAIN$EVIDENCE, { text: learning.evidence })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    data-testid="neo-brain-approve"
                    onClick={() => approvePending(workspaceId, learning.id)}
                    className="rounded-md bg-[var(--primary-500)] px-3 py-1.5 text-xs font-medium text-white"
                  >
                    {t(I18nKey.NEO_BRAIN$APPROVE)}
                  </button>
                  <button
                    type="button"
                    data-testid="neo-brain-dismiss"
                    onClick={() => dismissPending(workspaceId, learning.id)}
                    className="rounded-md border border-[var(--border-color)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    {t(I18nKey.NEO_BRAIN$DISMISS)}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </UsageSection>
      ) : null}

      {live.length === 0 ? (
        <p
          data-testid="neo-brain-empty"
          className="text-sm text-[var(--text-secondary)]"
        >
          {t(I18nKey.NEO_BRAIN$EMPTY)}
        </p>
      ) : (
        BRAIN_LAYERS.filter((layer) => byLayer.has(layer)).map((layer) => (
          <UsageSection key={layer} title={t(LAYER_LABELS[layer])}>
            <ul
              data-testid={`neo-brain-layer-${layer}`}
              className="flex flex-col gap-1"
            >
              {(byLayer.get(layer) ?? [])
                .sort((a, b) => Number(b.pinned) - Number(a.pinned))
                .slice(0, MAX_PER_LAYER)
                .map((record) => (
                  <li
                    key={record.id}
                    className="text-sm text-[var(--text-primary)]"
                  >
                    {record.statement}
                  </li>
                ))}
            </ul>
          </UsageSection>
        ))
      )}
    </div>
  );
}
