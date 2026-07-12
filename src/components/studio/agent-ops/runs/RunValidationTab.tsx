import { ChevronDown } from "lucide-react";

import {
  humanizeValidationOverall,
  validationOverallTone,
} from "@/components/studio/agent-ops/runs/runValidationDisplay";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { agentOpsChevronClass, agentOpsTransitionClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";
import { TabEmpty } from "@/components/studio/agent-ops/shared/TabEmpty";
import type { AgentRunCommandResult, AgentRunValidation } from "@/lib/agentRuns";
import { cn } from "@/lib/utils";

type RunValidationTabProps = {
  validation: AgentRunValidation;
  onRefreshRun?: () => void;
  emptyActionLabel?: string;
};

export function RunValidationTab({
  validation,
  onRefreshRun,
  emptyActionLabel = "Refresh run",
}: RunValidationTabProps) {
  const notes = validation.notes ?? [];
  const commands = validation.commands ?? [];
  const failedCount = commands.filter((command) => command.exitCode !== 0).length;

  return (
    <article className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">Validation</h3>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-[11px] font-medium",
            validationOverallTone(validation.overallStatus),
          )}
        >
          {humanizeValidationOverall(validation.overallStatus)}
        </span>
        {commands.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {commands.length} command{commands.length === 1 ? "" : "s"}
            {failedCount > 0 ? ` · ${failedCount} failed` : ""}
          </span>
        ) : null}
      </header>

      {notes.length > 0 ? (
        <section className="min-w-0">
          <h4 className="text-xs font-medium text-muted-foreground">Notes</h4>
          <ul className="mt-1.5 divide-y divide-border rounded-md border border-border">
            {notes.map((note) => (
              <li key={note} className="px-3 py-2 text-xs leading-5 text-foreground/80">
                {note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {commands.length > 0 ? (
        <ol className="divide-y divide-border rounded-md border border-border">
          {commands.map((command, index) => (
            <ValidationCommandRow key={`${command.command}-${command.durationMs}-${index}`} command={command} />
          ))}
        </ol>
      ) : (
        <TabEmpty
          title="No validation"
          message={
            validation.overallStatus === "not_run"
              ? AGENT_OPS_COPY.validationNotRun
              : AGENT_OPS_COPY.validationNoOutput
          }
          action={onRefreshRun ? { label: emptyActionLabel, onClick: onRefreshRun } : undefined}
        />
      )}
    </article>
  );
}

function ValidationCommandRow({ command }: { command: AgentRunCommandResult }) {
  const passed = command.exitCode === 0;

  return (
    <li className="min-w-0">
      <details
        className={cn(
          "group",
          !passed && "border-l-2 border-rose-400/45 bg-rose-950/[0.12]",
        )}
      >
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 hover:bg-muted/60 [&::-webkit-details-marker]:hidden",
            agentOpsTransitionClass,
          )}
        >
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
              passed
                ? "bg-emerald-300/10 text-emerald-700"
                : "border border-rose-400/30 bg-rose-400/10 text-rose-700",
            )}
          >
            {passed ? "Pass" : "Fail"}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={command.command}>
            {command.command}
          </span>
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">{command.durationMs}ms</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground group-open:rotate-180",
              agentOpsChevronClass,
            )}
            aria-hidden
          />
        </summary>

        <div className="space-y-2 border-t border-border px-3 py-2.5">
          <CommandLog label="stdout" content={command.stdout} emphasize={passed} />
          <CommandLog label="stderr" content={command.stderr} emphasize={!passed} />
        </div>
      </details>
    </li>
  );
}

function CommandLog({
  label,
  content,
  emphasize,
}: {
  label: string;
  content: string;
  emphasize?: boolean;
}) {
  const body = content || "(empty)";

  return (
    <div className="min-w-0">
      <div
        className={cn(
          "text-[10px] font-medium uppercase tracking-[0.08em]",
          emphasize ? "text-foreground/70" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-1 max-h-36 overflow-auto rounded border bg-black/20",
          emphasize && label === "stderr" && content
            ? "border-rose-400/20"
            : "border-border",
        )}
      >
        <pre className="overflow-x-auto p-2 font-mono text-[11px] leading-5 text-white/72">
          <code className="block whitespace-pre">{body}</code>
        </pre>
      </div>
    </div>
  );
}
