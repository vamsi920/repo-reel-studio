import React from "react";
import { useTranslation } from "react-i18next";
import { Brain, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import type { OpenHandsEvent } from "#/types/agent-server/core";
import {
  isActionEvent,
  isMessageEvent,
  isObservationEvent,
  isUserMessageEvent,
} from "#/types/agent-server/type-guards";
import { Messages } from "#/components/conversation-events/chat/messages";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

const ThinkingGraphView = React.lazy(() => import("./thinking-graph-view"));

/** How long a finished graph stays open before folding away. */
const AUTO_COLLAPSE_MS = 1400;

export interface ConversationTurn {
  /** Id of the user message that opened the turn (or a synthetic id). */
  id: string;
  /** Every event of the turn, starting with the user message if loaded. */
  events: OpenHandsEvent[];
}

/**
 * Splits the conversation history into turns: each user message starts a new
 * one. Events loaded before the first user message (an older window of a long
 * run) form a leading turn of their own.
 */
export function splitIntoTurns(
  events: readonly OpenHandsEvent[],
): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const event of events) {
    if (isUserMessageEvent(event) || turns.length === 0) {
      turns.push({
        id: isUserMessageEvent(event) ? event.id : `turn-${event.id}`,
        events: [],
      });
    }
    turns[turns.length - 1].events.push(event);
  }
  return turns;
}

/** Events shown as normal chat output under the graph: the agent's answer. */
export function isTurnOutputEvent(event: OpenHandsEvent): boolean {
  if (isMessageEvent(event)) return event.llm_message.role === "assistant";
  if (isActionEvent(event)) return event.action.kind === "FinishAction";
  if (isObservationEvent(event)) {
    return event.observation.kind === "FinishObservation";
  }
  return false;
}

function ThinkingPanel({
  turn,
  isDone,
}: {
  turn: ConversationTurn;
  isDone: boolean;
}) {
  const { t } = useTranslation("openhands");
  const [isOpen, setIsOpen] = React.useState(!isDone);
  const userToggled = React.useRef(false);
  const stepCount = turn.events.filter(isActionEvent).length;

  // Watch the agent think live, then fold the graph away once it's done so
  // the answer below takes the stage. A manual toggle always wins.
  React.useEffect(() => {
    if (userToggled.current) return undefined;
    if (!isDone) {
      setIsOpen(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setIsOpen(false), AUTO_COLLAPSE_MS);
    return () => window.clearTimeout(timer);
  }, [isDone]);

  if (stepCount === 0) return null;

  return (
    <section
      data-testid="thinking-panel"
      className="overflow-hidden rounded-md border border-[var(--oh-border-subtle,#d9dee8)] bg-[var(--oh-surface,#ffffff)]"
    >
      <button
        type="button"
        data-testid="thinking-panel-toggle"
        aria-expanded={isOpen}
        onClick={() => {
          userToggled.current = true;
          setIsOpen((open) => !open);
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded bg-[#ede9fe] text-[#7c3aed]">
          <Brain size={14} />
        </span>
        <span className="font-mono text-xs font-semibold tracking-wide text-[var(--oh-foreground,#0f172a)]">
          {isDone
            ? t(I18nKey.THINKING_GRAPH$PANEL_DONE, { count: stepCount })
            : t(I18nKey.THINKING_GRAPH$PANEL_RUNNING)}
        </span>
        {isDone ? (
          <CheckCircle2 size={14} className="text-[#10b981]" />
        ) : (
          <Loader2 size={14} className="animate-spin text-[#3b6cf6]" />
        )}
        <span className="ml-auto flex items-center gap-1 text-[11px] text-[var(--oh-muted,#64748b)]">
          {isOpen
            ? t(I18nKey.THINKING_GRAPH$PANEL_HIDE)
            : t(I18nKey.THINKING_GRAPH$PANEL_SHOW)}
          <ChevronDown
            size={14}
            className={cn("transition-transform", isOpen && "rotate-180")}
          />
        </span>
      </button>
      {isOpen && (
        <div className="h-[380px] border-t border-[var(--oh-border-subtle,#d9dee8)]">
          <React.Suspense fallback={null}>
            <ThinkingGraphView events={turn.events} />
          </React.Suspense>
        </div>
      )}
    </section>
  );
}

/**
 * Graph-mode chat: for every turn, the user's message, then a "Thinking"
 * panel where the agent's work plays out as a live graph, then the agent's
 * answer as a normal chat message. The panel folds away when the turn ends.
 */
export function GraphTranscript({
  renderableEvents,
  allEvents,
  isAgentRunning,
}: {
  renderableEvents: OpenHandsEvent[];
  allEvents: OpenHandsEvent[];
  isAgentRunning: boolean;
}) {
  const turns = React.useMemo(() => splitIntoTurns(allEvents), [allEvents]);
  const turnOf = React.useMemo(() => {
    const map = new Map<string | undefined, number>();
    turns.forEach((turn, index) => {
      for (const event of turn.events) map.set(event.id, index);
    });
    return map;
  }, [turns]);

  return (
    <div className="flex flex-col gap-3">
      {turns.map((turn, index) => {
        const visible = renderableEvents.filter(
          (event) => turnOf.get(event.id) === index,
        );
        const prompt = visible.filter(isUserMessageEvent);
        const output = visible.filter(isTurnOutputEvent);
        const isLast = index === turns.length - 1;
        const isDone = !isLast || output.length > 0 || !isAgentRunning;
        return (
          <div key={turn.id} className="flex flex-col gap-3">
            {prompt.length > 0 && (
              <Messages messages={prompt} allEvents={allEvents} />
            )}
            <ThinkingPanel turn={turn} isDone={isDone} />
            {output.length > 0 && (
              <Messages messages={output} allEvents={allEvents} />
            )}
          </div>
        );
      })}
    </div>
  );
}
