import type { ReactNode } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { CollectorUnavailable } from "./collector-unavailable";

interface AgentOpsPanelProps {
  isLoading: boolean;
  error: unknown;
  /**
   * Whether the tab still holds real data from an earlier successful fetch.
   * When set, a failed refetch keeps the children mounted behind a "collector
   * isn't answering" banner instead of swapping them for the card — a tab with
   * a form (Budgets) would otherwise lose half-typed edits on every collector
   * blip, which every Fly deploy causes for ~30 s.
   */
  hasData?: boolean;
  children: ReactNode;
}

/**
 * Query-state wrapper shared by the Control Tower tabs.
 *
 * Any error is treated as "no real telemetry available" and routed to
 * {@link CollectorUnavailable}, because that is what an error means here: the
 * collector is down, unreachable, or rejecting us. There is no partial or
 * placeholder rendering — the only exception is `hasData`, where what stays on
 * screen is the collector's own last answer, labelled as stale.
 */
export function AgentOpsPanel({
  isLoading,
  error,
  hasData = false,
  children,
}: AgentOpsPanelProps) {
  const { t } = useTranslation("openhands");

  if (error && !hasData) return <CollectorUnavailable error={error} />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-sm text-[var(--text-secondary)]">
        <Loader2 size={16} className="animate-spin" />
        {t(I18nKey.AGENTOPS$LOADING)}
      </div>
    );
  }

  // The banner and the children always occupy the same two slots, so a
  // refetch failing and recovering never changes the children's position in
  // the tree — a remount would wipe exactly the form state this exists for.
  return (
    <>
      {error ? (
        <div
          role="status"
          data-testid="agentops-collector-stale"
          className="mb-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--warning-500)] bg-[var(--warning-bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]"
        >
          <TriangleAlert
            size={14}
            className="mt-0.5 shrink-0 text-[var(--warning-500)]"
          />
          <span>{t(I18nKey.AGENTOPS$COLLECTOR_STALE_BANNER)}</span>
        </div>
      ) : null}
      {children}
    </>
  );
}
