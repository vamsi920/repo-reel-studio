import { GitPullRequest } from "lucide-react";

/* eslint-disable i18next/no-literal-string -- decorative landing mockup copy */

/**
 * A small, illustrative code-review panel — not a live screenshot, a
 * hand-built mockup using the app's own card chrome and tokens. Gives the
 * "Human in the loop" trust point something concrete to look at instead of
 * another icon.
 */
export function LandingDiffMockup() {
  return (
    <div className="instrument-panel ame-card w-full max-w-lg overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-4 py-3">
        <GitPullRequest
          className="size-3.5 text-[var(--text-tertiary)]"
          aria-hidden
        />
        <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
          src/payments/retryPolicy.ts
        </span>
        <span className="ml-auto rounded-full bg-[var(--warning-bg-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--warning-500)]">
          Review requested
        </span>
      </div>

      <div className="font-mono text-[13px] leading-relaxed">
        <div className="bg-[rgba(211,34,34,0.08)] px-4 py-1 text-[var(--error-500)]">
          − if (retries &gt; 3) throw new Error(&quot;exceeded&quot;);
        </div>
        <div className="bg-[rgba(24,140,66,0.08)] px-4 py-1 text-[var(--success-500)]">
          + if (retries &gt; MAX_RETRIES) throw new RetryLimitError();
        </div>
        <div className="bg-[rgba(24,140,66,0.08)] px-4 py-1 text-[var(--success-500)]">
          + logRetryExhausted(orderId, retries);
        </div>
        <div className="px-4 py-1 text-[var(--text-tertiary)]">
          &nbsp;&nbsp;await notifyBillingTeam(orderId);
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border-color)] px-4 py-3 text-xs text-[var(--text-secondary)]">
        <span className="size-1.5 rounded-full bg-[var(--warning-500)]" />
        Waiting on your approval — nothing merges without it.
      </div>
    </div>
  );
}
