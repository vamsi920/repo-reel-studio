import React from "react";
import { useTranslation } from "react-i18next";

import { useActiveBackend } from "#/contexts/active-backend-context";
import { I18nKey } from "#/i18n/declaration";
import { useResolvedWorkspaces } from "#/hooks/query/use-resolved-workspaces";
import {
  computeWorkspaceId,
  listKnownWorkspaceIds,
} from "#/lib/workspace-memory";

import type { UsageSelection } from "./use-usage-data";

export const ALL_WORKSPACES_VALUE = "__all__";

export interface UsageWorkspaceOption {
  value: string;
  label: string;
}

/**
 * Shortens an opaque `ws_...` id to something a user can at least tell apart
 * from another, for data that outlived the workspace it came from (removed
 * from the picker, or from a different browser profile).
 */
function fallbackLabel(workspaceId: string): string {
  return `Unknown workspace (${workspaceId.slice(0, 10)})`;
}

/**
 * Builds the dropdown's options: every workspace Home's own picker knows
 * about (so the two pages agree on names), plus any workspace id that has
 * recorded memory data but no longer has a matching entry there.
 */
export function useUsageWorkspaceOptions(): {
  options: UsageWorkspaceOption[];
  labelByWorkspaceId: Record<string, string>;
  isLoading: boolean;
} {
  const { backend } = useActiveBackend();
  const { workspaces, isLoading } = useResolvedWorkspaces();

  return React.useMemo(() => {
    const labelByWorkspaceId: Record<string, string> = {};
    const options: UsageWorkspaceOption[] = [];

    workspaces.forEach((workspace) => {
      const workspaceId = computeWorkspaceId(backend?.id, workspace.path);
      if (!workspaceId) return;
      labelByWorkspaceId[workspaceId] = workspace.name;
      options.push({ value: workspaceId, label: workspace.name });
    });

    listKnownWorkspaceIds()
      .filter((id) => !labelByWorkspaceId[id])
      .forEach((id) => {
        const label = fallbackLabel(id);
        labelByWorkspaceId[id] = label;
        options.push({ value: id, label });
      });

    return { options, labelByWorkspaceId, isLoading };
  }, [workspaces, backend?.id, isLoading]);
}

export function selectionFromValue(value: string): UsageSelection {
  return value === ALL_WORKSPACES_VALUE
    ? { all: true }
    : { workspaceId: value };
}

export function valueFromSelection(selection: UsageSelection): string {
  return "workspaceId" in selection
    ? selection.workspaceId
    : ALL_WORKSPACES_VALUE;
}

interface UsageWorkspaceSelectProps {
  selection: UsageSelection;
  onChange: (selection: UsageSelection) => void;
}

export function UsageWorkspaceSelect({
  selection,
  onChange,
}: UsageWorkspaceSelectProps) {
  const { t } = useTranslation("openhands");
  const { options } = useUsageWorkspaceOptions();

  return (
    <select
      data-testid="usage-workspace-select"
      aria-label={t(I18nKey.USAGE$WORKSPACE_COLUMN)}
      className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      value={valueFromSelection(selection)}
      onChange={(event) => onChange(selectionFromValue(event.target.value))}
    >
      <option value={ALL_WORKSPACES_VALUE}>
        {t(I18nKey.USAGE$ALL_WORKSPACES_OPTION)}
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
