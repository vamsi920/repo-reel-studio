import { useMemo } from "react";

import {
  buildProactiveLiveGroups,
  type ProactiveEventSource,
  type ProactiveTimelineRow,
} from "@/components/studio/agent-ops/proactive/proactiveEventTimeline";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import {
  agentOpsConsoleEmptyClass,
  agentOpsConsoleViewportClass,
} from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { fmtTime } from "@/components/studio/agent-ops/shared/timeFormat";
import { AgentNarrationFeed, type AgentNarrationLine } from "@/components/studio/agent-ops/shared/AgentNarrationFeed";
import { ScrollArea } from "@/components/ui/scroll-area";
import { narrateLiveEvent } from "@/lib/agentNarration";
import type { ProactiveCandidate, ProactiveStatus } from "@/lib/proactiveAgentOps";
import { cn } from "@/lib/utils";

export type ProactiveConsoleMode = "raw" | "narrated";

export type ProactiveLiveConsoleProps = {
  candidate: ProactiveCandidate | null;
  batch: ProactiveStatus["batch"] | null;
  mode?: ProactiveConsoleMode;
  onModeChange?: (mode: ProactiveConsoleMode) => void;
};

export function ProactiveLiveConsole({ candidate, batch, mode = "raw", onModeChange }: ProactiveLiveConsoleProps) {
  const groups = useMemo(() => buildProactiveLiveGroups(candidate, batch), [candidate, batch]);
  const eventCount = groups.reduce((sum, group) => sum + group.events.length, 0);

  const narrationLines: AgentNarrationLine[] = useMemo(
    () =>
      groups.flatMap((group) =>
        group.events.map((event) => ({
          id: event.id,
          text: narrateLiveEvent(event),
          at: event.at,
          tone: event.level === "error" ? "error" : "neutral",
        })),
      ),
    [groups],
  );

  return (
    <section aria-label="Live console" className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Live console</h4>
        <div className="flex items-center gap-2">
          {eventCount > 0 ? (
            <span className="text-[10px] tabular-nums text-muted-foreground">{eventCount} events</span>
          ) : null}
          {onModeChange ? (
            <div className="flex items-center rounded-md border border-border p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => onModeChange("raw")}
                className={cn(
                  "rounded px-1.5 py-0.5 font-medium uppercase tracking-wide transition-colors",
                  mode === "raw" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Raw log
              </button>
              <button
                type="button"
                onClick={() => onModeChange("narrated")}
                className={cn(
                  "rounded px-1.5 py-0.5 font-medium uppercase tracking-wide transition-colors",
                  mode === "narrated" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                Plain English
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {eventCount === 0 ? (
        <p
          className={cn(
            agentOpsConsoleEmptyClass,
            "border-border text-center text-[11px] leading-4 text-muted-foreground",
          )}
        >
          {AGENT_OPS_COPY.liveConsoleEmpty}
        </p>
      ) : mode === "narrated" ? (
        <ScrollArea
          className={cn(agentOpsConsoleViewportClass, "rounded-md border border-border bg-card/60")}
        >
          <div className="p-2">
            <AgentNarrationFeed lines={narrationLines} />
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea
          className={cn(
            agentOpsConsoleViewportClass,
            "rounded-md border border-border bg-[#050b14]/80",
          )}
        >
          <div className="divide-y divide-white/[0.05] p-1.5">
            {groups.map((group) => (
              <LiveEventGroup key={group.source} label={group.label} source={group.source} events={group.events} />
            ))}
          </div>
        </ScrollArea>
      )}
    </section>
  );
}

function LiveEventGroup({
  label,
  source,
  events,
}: {
  label: string;
  source: ProactiveEventSource;
  events: ProactiveTimelineRow[];
}) {
  return (
    <div className="py-1">
      <p className="px-1 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/28">{label}</p>
      <ol className="space-y-px">
        {events.map((event) => (
          <LiveEventRow key={event.id} event={event} source={source} />
        ))}
      </ol>
    </div>
  );
}

function LiveEventRow({ event, source }: { event: ProactiveTimelineRow; source: ProactiveEventSource }) {
  const snippet = event.snippet ?? event.detail;
  const showSnippet = Boolean(snippet) && (event.kind === "validation" || (snippet && snippet !== event.title));

  return (
    <li className="flex min-w-0 gap-1.5 rounded px-1 py-0.5 hover:bg-white/[0.03]">
      <SourceBadge source={source} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <time className="shrink-0 font-mono text-[10px] tabular-nums text-white/28">
            {event.at ? fmtTime(event.at) : "—"}
          </time>
          <span className="shrink-0 font-mono text-[10px] uppercase text-white/35">{event.stage}</span>
          <span className="min-w-0 truncate text-[11px] text-white/78" title={event.title}>
            {event.title}
          </span>
        </div>
        {showSnippet ? (
          <p
            className={cn(
              "mt-0.5 line-clamp-1 font-mono text-[10px] leading-4",
              event.level === "error" ? "text-rose-200/75" : "text-white/38",
            )}
            title={snippet ?? undefined}
          >
            {snippet}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function SourceBadge({ source }: { source: ProactiveEventSource }) {
  return (
    <span
      className={cn(
        "mt-0.5 shrink-0 self-start rounded px-1 py-px text-[8px] font-bold uppercase tracking-[0.06em]",
        source === "batch" && "bg-violet-400/12 text-violet-200/85",
        source === "candidate" && "bg-emerald-400/12 text-emerald-200/85",
        source === "run" && "bg-sky-400/12 text-sky-200/85",
      )}
    >
      {source}
    </span>
  );
}
