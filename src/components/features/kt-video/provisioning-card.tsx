import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import type { ProvisioningStage } from "#/stores/knowledge-store";
import type { DeepWikiTaskStatus } from "#/api/deepwiki-service/deepwiki-service.types";

const STEP_LABELS = [
  "Setting up workspace",
  "Resolving repository",
  "Indexing codebase",
  "Understanding structure",
  "Writing knowledge",
] as const;

/** Maps the pre-generation provisioning stage and DeepWiki's own real task
 * status onto one fixed 5-step sequence — the only two stages that come
 * before DeepWiki has a task at all are provisioning-side; the rest mirror
 * DeepWiki's actual TaskStatus enum directly, no invented states. */
function resolveStepIndex(
  provisioningStage: ProvisioningStage | null,
  deepWikiStatus: DeepWikiTaskStatus | null,
): number {
  if (deepWikiStatus) {
    switch (deepWikiStatus) {
      case "pending":
      case "indexing":
        return 2;
      case "determining_structure":
        return 3;
      case "generating":
      case "completed":
        return 4;
      case "failed":
        return 4;
      default:
        return 2;
    }
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
  pagesDone,
  pagesTotal,
  error,
}: {
  owner: string;
  repo: string;
  branch: string;
  provisioningStage: ProvisioningStage | null;
  deepWikiStatus: DeepWikiTaskStatus | null;
  /** Real counts from DeepWiki's task summary (pages_done/pages_total) —
   * only meaningful once it's past structure analysis and actually writing
   * pages, so the "Writing knowledge" step can show live "(3/12)" progress
   * instead of just a spinner. */
  pagesDone?: number;
  pagesTotal?: number;
  error: string | null;
}) {
  const activeIndex = resolveStepIndex(provisioningStage, deepWikiStatus);
  const showPageCount =
    activeIndex === 4 && !!pagesTotal && pagesTotal > 0 && !error;

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

      <div className="flex flex-col gap-1.5">
        {STEP_LABELS.map((label, index) => {
          const isDone = index < activeIndex;
          const isActive = index === activeIndex && !error;
          const isFailed = error !== null && index === activeIndex;

          return (
            <div key={label} className="flex items-center gap-2 text-xs">
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
                {index === 4 && showPageCount
                  ? ` (${pagesDone ?? 0}/${pagesTotal})`
                  : ""}
              </span>
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-[var(--error-500)]">{error}</p>}
    </div>
  );
}
