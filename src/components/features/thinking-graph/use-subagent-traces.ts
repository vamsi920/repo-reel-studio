import React from "react";
import { FileClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { getAgentServerHomeDir } from "#/api/agent-server-home";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { searchAllSubdirectories } from "#/hooks/query/use-search-subdirs";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import {
  isActionEvent,
  isObservationEvent,
} from "#/types/agent-server/type-guards";
import {
  SUBAGENT_TRACE_FILE,
  SUBAGENT_TRACE_ROOT,
  matchTracesToTasks,
  parseSubagentTrace,
  traceDatesFor,
  type SubagentTrace,
} from "./subagent-trace";

const POLL_MS = 2000;

interface TaskRef {
  id: string;
  prompt: string;
  timestamp: string;
  isOpen: boolean;
}

function taskRefs(events: readonly OpenHandsEvent[]): TaskRef[] {
  const closed = new Set<string>();
  for (const event of events) {
    if (isObservationEvent(event)) closed.add(event.action_id);
  }
  const refs: TaskRef[] = [];
  for (const event of events) {
    if (isActionEvent(event) && event.action.kind === "TaskAction") {
      const { prompt } = event.action as { prompt?: string };
      refs.push({
        id: event.id,
        prompt: prompt ?? "",
        timestamp: event.timestamp,
        isOpen: !closed.has(event.id),
      });
    }
  }
  return refs;
}

/**
 * Live sub-agent steps for the Task actions in `events`, keyed by action id.
 * Reads the trace files the `neo-*` sub-agents' hook writes on the
 * agent-server host. Polls while any sub-agent is still working; reads once
 * otherwise. Local backends only (Cloud sandboxes aren't reachable here).
 */
export function useSubagentTraces(
  events: readonly OpenHandsEvent[],
): Map<string, SubagentTrace> {
  const { backend } = useActiveBackend();
  const tasks = React.useMemo(() => taskRefs(events), [events]);
  const [traces, setTraces] = React.useState<Map<string, SubagentTrace>>(
    () => new Map(),
  );
  // Sessions known to belong to some other task — never downloaded again.
  const foreign = React.useRef(new Set<string>());
  const finished = React.useRef(new Map<string, SubagentTrace>());

  const taskKey = tasks.map((t) => `${t.id}:${t.isOpen}`).join("|");
  const anyOpen = tasks.some((t) => t.isOpen);

  React.useEffect(() => {
    if (tasks.length === 0 || backend.kind === "cloud") return undefined;
    let cancelled = false;
    const prompts = new Set(tasks.map((t) => t.prompt.trim()));

    const load = async () => {
      const files = new FileClient(getAgentServerClientOptions());
      const home = await getAgentServerHomeDir();
      const collected: SubagentTrace[] = [...finished.current.values()];
      for (const date of traceDatesFor(tasks.map((t) => t.timestamp))) {
        let sessions: { name: string; path: string }[] = [];
        try {
          ({ items: sessions } = await searchAllSubdirectories(
            `${home}/${SUBAGENT_TRACE_ROOT}/${date}`,
            files,
          ));
        } catch {
          continue; // no traces filed under this date
        }
        for (const session of sessions) {
          if (
            foreign.current.has(session.name) ||
            finished.current.has(session.name)
          ) {
            continue;
          }
          try {
            const text = await files.downloadTextFile(
              `${session.path}/${SUBAGENT_TRACE_FILE}`,
            );
            const trace = parseSubagentTrace(session.name, text);
            if (trace.prompt !== null && !prompts.has(trace.prompt)) {
              foreign.current.add(session.name);
              continue;
            }
            if (trace.finished) finished.current.set(session.name, trace);
            collected.push(trace);
          } catch {
            // File not written yet — next poll.
          }
        }
      }
      if (!cancelled) setTraces(matchTracesToTasks(collected, tasks));
    };

    load().catch(() => {});
    if (!anyOpen) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(() => {
      load().catch(() => {});
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // `taskKey` captures every input that changes what to fetch.
  }, [taskKey, backend.kind]);

  return traces;
}
