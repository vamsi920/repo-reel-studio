import { ExternalLink, GitPullRequest } from "lucide-react";

import { ReviewSection } from "@/components/studio/agent-ops/runs/ReviewSection";
import { fmtTime } from "@/components/studio/agent-ops/shared/timeFormat";
import type { AgentRun } from "@/lib/agentRuns";
import { agentOpsTransitionClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";
import { cn } from "@/lib/utils";

type RunSummaryTabProps = {
  run: AgentRun;
  onFocusFile?: (filePath: string) => void;
};

export function RunSummaryTab({ run, onFocusFile }: RunSummaryTabProps) {
  const changeIntent = run.artifacts.changeIntent ?? null;
  const changedFiles = run.artifacts.changedFiles ?? [];
  const timeline = run.timeline ?? [];
  const instructions = run.approval?.instructions ?? [];
  const prUrl = run.approval?.prUrl?.trim() || null;

  const whatChanged =
    changeIntent?.hypothesis?.trim() ||
    changeIntent?.planSummary?.trim() ||
    run.plan?.summary?.trim() ||
    null;

  const tasks = changeIntent?.taskBreakdown ?? [];
  const blastRadius = changeIntent?.blastRadius ?? [];
  const selfCritique = changeIntent?.selfCritique?.trim() || null;

  return (
    <article className="min-w-0 space-y-5 text-sm leading-relaxed">
      {prUrl ? (
        <a
          href={prUrl}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "flex min-w-0 items-center gap-2 border-b border-emerald-300/20 pb-3 text-emerald-700 hover:text-emerald-800",
            agentOpsTransitionClass,
          )}
          title={prUrl}
        >
          <GitPullRequest className="h-4 w-4 shrink-0" aria-hidden />
          <span className="shrink-0 font-medium">PR opened</span>
          <span className="min-w-0 truncate font-mono text-xs text-emerald-700/80">{prUrl}</span>
          <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        </a>
      ) : null}

      <ReviewSection title="What changed">
        {whatChanged ? (
          <p className="text-foreground/85">{whatChanged}</p>
        ) : (
          <p className="text-muted-foreground">No change summary recorded for this run.</p>
        )}
        {selfCritique ? (
          <blockquote className="mt-3 border-l-2 border-amber-400/35 pl-3 text-foreground/75">
            <span className="text-xs font-medium text-amber-700">Self-critique · </span>
            {selfCritique}
          </blockquote>
        ) : null}
      </ReviewSection>

      {tasks.length > 0 ? (
        <ReviewSection title="Task breakdown">
          <ol className="divide-y divide-border">
            {tasks.map((task, index) => (
              <li key={`${task.title}-${index}`} className="flex gap-2.5 py-2 first:pt-0 last:pb-0">
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                    task.acceptanceMet
                      ? "bg-emerald-300/12 text-emerald-700"
                      : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {task.acceptanceMet ? "✓" : index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{task.title}</p>
                  {task.detail ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{task.detail}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </ReviewSection>
      ) : null}

      {blastRadius.length > 0 ? (
        <ReviewSection title="Blast radius">
          <p className="flex flex-wrap gap-x-2 gap-y-1 text-foreground/75">
            {blastRadius.map((dir) => (
              <span key={dir} className="font-mono text-xs">
                {dir}
              </span>
            ))}
          </p>
        </ReviewSection>
      ) : null}

      {instructions.length > 0 ? (
        <ReviewSection title="Manual push instructions">
          <pre className="overflow-x-auto rounded-md bg-black/25 px-3 py-2.5 font-mono text-xs leading-5 text-white/72">
            <code>{instructions.join("\n")}</code>
          </pre>
        </ReviewSection>
      ) : null}

      <ReviewSection title="Changed files">
        {changedFiles.length > 0 ? (
          <ul className="divide-y divide-border">
            {changedFiles.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  onClick={() => onFocusFile?.(file.path)}
                  disabled={!onFocusFile}
                  className={cn(
                    "flex w-full min-w-0 items-center justify-between gap-3 py-2 text-left",
                    onFocusFile ? "hover:bg-muted/60" : "cursor-default",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs text-foreground">{file.path}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {file.changedLines} line{file.changedLines === 1 ? "" : "s"} changed
                      {file.sensitive ? <span className="text-amber-700"> · sensitive</span> : null}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    <span className="text-emerald-600">+{file.additions}</span>
                    <span className="text-muted-foreground/50"> / </span>
                    <span className="text-rose-600">-{file.deletions}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No changed files recorded.</p>
        )}
      </ReviewSection>

      <ReviewSection title="Recent activity">
        {timeline.length > 0 ? (
          <ul className="divide-y divide-border">
            {timeline.map((event) => (
              <li key={event.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <p
                    className={cn(
                      "min-w-0 font-medium leading-snug",
                      event.level === "error"
                        ? "text-rose-600"
                        : event.level === "warning"
                          ? "text-amber-700"
                          : "text-foreground",
                    )}
                  >
                    {event.title}
                  </p>
                  {event.at ? (
                    <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground" dateTime={event.at}>
                      {fmtTime(event.at)}
                    </time>
                  ) : null}
                </div>
                {event.detail ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.detail}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Timeline events will appear as the run progresses.</p>
        )}
      </ReviewSection>
    </article>
  );
}
