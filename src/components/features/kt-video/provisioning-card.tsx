import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProvisioningStage } from "#/stores/knowledge-store";
import type { DeepWikiTaskStatus } from "#/api/deepwiki-service/deepwiki-service.types";
import { I18nKey } from "#/i18n/declaration";

const STEP_LABEL_KEYS = [
  I18nKey.KT$PROVISIONING_STEP_WORKSPACE,
  I18nKey.KT$PROVISIONING_STEP_REPOSITORY,
  I18nKey.KT$PROVISIONING_STEP_INDEXING,
  I18nKey.KT$PROVISIONING_STEP_STRUCTURE,
  I18nKey.KT$PROVISIONING_STEP_WRITING,
] as const;

/** Maps a real, non-terminal DeepWiki status onto its step index. */
function stepForStatus(status: DeepWikiTaskStatus): number {
  switch (status) {
    case "pending":
    case "indexing":
      return 2;
    case "determining_structure":
      return 3;
    case "generating":
    case "completed":
      return 4;
    default:
      return 2;
  }
}

/** Maps the pre-generation provisioning stage and DeepWiki's own real task
 * status onto one fixed 5-step sequence — the only two stages that come
 * before DeepWiki has a task at all are provisioning-side; the rest mirror
 * DeepWiki's actual TaskStatus enum directly, no invented states.
 *
 * "failed" carries no memory of which stage the task had reached, so it is
 * resolved from `lastNonTerminalStatus` (the last real progress tick before
 * the failure) instead of always pointing at the final step — otherwise a
 * task that died while still indexing would show indexing and structure
 * analysis as falsely completed. */
function resolveStepIndex(
  provisioningStage: ProvisioningStage | null,
  deepWikiStatus: DeepWikiTaskStatus | null,
  lastNonTerminalStatus: DeepWikiTaskStatus | null,
): number {
  if (deepWikiStatus) {
    if (deepWikiStatus === "failed") {
      return lastNonTerminalStatus ? stepForStatus(lastNonTerminalStatus) : 2;
    }
    return stepForStatus(deepWikiStatus);
  }
  switch (provisioningStage) {
    case "creating_conversation":
    case "provisioning_workspace":
      return 0;
    case "resolving_commit":
      return 1;
    default:
      return 0;
  }
}

export function ProvisioningCard({
  owner,
  repo,
  branch,
  provisioningStage,
  deepWikiStatus,
  lastNonTerminalStatus = null,
  pagesDone,
  pagesTotal,
  error,
  onDismiss,
}: {
  owner: string;
  repo: string;
  branch: string;
  provisioningStage: ProvisioningStage | null;
  deepWikiStatus: DeepWikiTaskStatus | null;
  /** The last non-terminal status seen before a "failed" status, so the
   * step list can reflect how far the task actually got. */
  lastNonTerminalStatus?: DeepWikiTaskStatus | null;
  /** Real counts from DeepWiki's task summary (pages_done/pages_total) —
   * only meaningful once it's past structure analysis and actually writing
   * pages, so the "Writing knowledge" step can show live "(3/12)" progress
   * instead of just a spinner. */
  pagesDone?: number;
  pagesTotal?: number;
  error: string | null;
  /** Clears this card's entry from the store. Only rendered when `error` is
   * set — a provisioning failure that happens before any conversation is
   * ever created (e.g. `createConversation` itself rejects) has no other
   * path back to "known" that would otherwise make this card disappear, so
   * without an explicit action it sat on the page forever with no way for
   * the user to clear it short of a full page reload. Omit to render the
   * card with no dismiss control (e.g. call sites without a clearable
   * entry). */
  onDismiss?: () => void;
}) {
  const { t } = useTranslation("openhands");
  const stepLabels = STEP_LABEL_KEYS.map((key) => t(key));
  const activeIndex = resolveStepIndex(
    provisioningStage,
    deepWikiStatus,
    lastNonTerminalStatus,
  );
  const showPageCount =
    activeIndex === 4 && !!pagesTotal && pagesTotal > 0 && !error;
  const pageCountText = showPageCount
    ? ` ${t(I18nKey.KT$PROVISIONING_PAGE_COUNT, {
        done: pagesDone ?? 0,
        total: pagesTotal,
      })}`
    : "";
  // Every step's label renders unconditionally (only its icon/color changes
  // as `activeIndex` advances), so a screen reader gets no signal that
  // provisioning is progressing at all -- icons are `aria-hidden` and color
  // alone isn't perceivable. This mirrors that same progress as text in a
  // live region instead.
  const currentStepStatus = error
    ? t(I18nKey.KT$PROVISIONING_STEP_FAILED, {
        label: stepLabels[activeIndex],
        error,
      })
    : `${t(I18nKey.KT$PROVISIONING_STEP_STATUS, {
        current: activeIndex + 1,
        total: stepLabels.length,
        label: stepLabels[activeIndex],
      })}${pageCountText}`;

  return (
    <div
      data-testid="kt-provisioning-card"
      className="instrument-panel ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-center gap-2">
        <BookOpen className="size-4 text-[var(--oh-muted)]" aria-hidden />
        <span className="text-sm font-medium text-[var(--oh-foreground)]">
          {owner}/{repo}
        </span>
        <span className="text-xs text-[var(--oh-muted)]">{branch}</span>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {currentStepStatus}
      </div>

      <div className="flex flex-col gap-1.5">
        {stepLabels.map((label, index) => {
          const isDone = index < activeIndex;
          const isActive = index === activeIndex && !error;
          const isFailed = error !== null && index === activeIndex;

          return (
            <div
              key={STEP_LABEL_KEYS[index]}
              className="flex items-center gap-2 text-xs"
            >
              {isFailed ? (
                <AlertCircle
                  className="size-3.5 shrink-0 text-[var(--error-500)]"
                  aria-hidden
                />
              ) : isDone ? (
                <CheckCircle2
                  className="size-3.5 shrink-0 text-[var(--success-500)]"
                  aria-hidden
                />
              ) : isActive ? (
                <Loader2
                  className="size-3.5 shrink-0 animate-spin text-[var(--warning-500)]"
                  aria-hidden
                />
              ) : (
                <Circle
                  className="size-3.5 shrink-0 text-[var(--oh-border)]"
                  aria-hidden
                />
              )}
              <span
                className={
                  isFailed
                    ? "text-[var(--error-500)]"
                    : isDone || isActive
                      ? "text-[var(--oh-foreground)]"
                      : "text-[var(--oh-muted)]"
                }
              >
                {label}
                {index === 4 ? pageCountText : ""}
              </span>
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-[var(--error-500)]">{error}</p>}
      {error && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          data-testid="kt-provisioning-dismiss"
          className="ame-btn-secondary ame-btn-sm self-start"
        >
          {t(I18nKey.KT$PROVISIONING_DISMISS)}
        </button>
      )}
    </div>
  );
}
