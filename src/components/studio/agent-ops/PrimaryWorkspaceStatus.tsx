import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { agentOpsStatusBlockClass } from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { cn } from "@/lib/utils";

import type { AgentOpsWorkspaceTab } from "@/components/studio/agent-ops/types";

type PrimaryWorkspaceStatusProps = {
  workspaceTab: AgentOpsWorkspaceTab;
  activeRunCount: number;
  pendingReview: number;
  proactiveReadyCount: number;
  proactiveTarget: number;
};

export function PrimaryWorkspaceStatus({
  workspaceTab,
  activeRunCount,
  pendingReview,
  proactiveReadyCount,
  proactiveTarget,
}: PrimaryWorkspaceStatusProps) {
  if (workspaceTab === "runs") {
    const tone =
      pendingReview > 0 ? "attention" : activeRunCount > 0 ? "active" : ("idle" as const);
    const value = pendingReview > 0 ? pendingReview : activeRunCount;
    const headline =
      pendingReview > 0
        ? AGENT_OPS_COPY.awaitingReview
        : activeRunCount > 0
          ? AGENT_OPS_COPY.runsInProgress
          : AGENT_OPS_COPY.runsIdle;
    const detail = pendingReview > 0 && activeRunCount > 0 ? `${activeRunCount} running` : undefined;

    return <StatusBlock tone={tone} value={value} headline={headline} detail={detail} />;
  }

  const tone = proactiveReadyCount > 0 ? "ready" : ("idle" as const);
  const headline =
    proactiveReadyCount > 0 ? AGENT_OPS_COPY.candidatesReady : AGENT_OPS_COPY.noCandidatesReady;

  return (
    <StatusBlock
      tone={tone}
      value={proactiveReadyCount}
      headline={headline}
      suffix={proactiveReadyCount > 0 ? `/${proactiveTarget}` : undefined}
      detail={proactiveReadyCount > 0 ? AGENT_OPS_COPY.candidatesReadyDetail : AGENT_OPS_COPY.proactiveScopeShort}
    />
  );
}

function StatusBlock({
  tone,
  value,
  headline,
  detail,
  suffix,
}: {
  tone: "attention" | "active" | "ready" | "idle";
  value: number;
  headline: string;
  detail?: string;
  suffix?: string;
}) {
  return (
    <div
      className={cn(
        agentOpsStatusBlockClass,
        "w-full max-w-full rounded-xl border px-4 py-3 sm:w-auto sm:min-w-[200px] sm:px-5",
        tone === "attention" && "border-amber-300/20 bg-amber-300/[0.07]",
        tone === "active" && "border-sky-300/20 bg-sky-300/[0.06]",
        tone === "ready" && "border-emerald-300/20 bg-emerald-300/[0.07]",
        tone === "idle" && "border-white/[0.08] bg-white/[0.03]",
      )}
    >
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl xl:text-4xl",
            tone === "attention" && "text-amber-50",
            tone === "active" && "text-sky-50",
            tone === "ready" && "text-emerald-50",
            tone === "idle" && "text-white/72",
          )}
        >
          {value}
        </span>
        {suffix ? (
          <span className="text-base font-medium tabular-nums text-white/36 sm:text-lg">{suffix}</span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-0.5 line-clamp-2 text-xs font-semibold leading-snug sm:text-sm",
          tone === "idle" ? "text-white/58" : "text-white",
        )}
      >
        {headline}
      </p>
      {detail ? (
        <p className="mt-1 min-h-5 text-xs leading-5 text-white/42">{detail}</p>
      ) : (
        <p className="mt-1 min-h-5" aria-hidden />
      )}
    </div>
  );
}
