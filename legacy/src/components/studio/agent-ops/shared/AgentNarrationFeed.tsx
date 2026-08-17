import { useEffect, useRef, useState } from "react";
import { Bot, Loader2 } from "lucide-react";

import { THINKING_LINES } from "@/lib/agentNarration";
import { cn } from "@/lib/utils";

export interface AgentNarrationLine {
  id: string;
  text: string;
  at?: string | null;
  tone?: "neutral" | "success" | "warning" | "error";
}

export interface AgentNarrationFeedProps {
  lines: AgentNarrationLine[];
  /** Show a trailing "thinking" row — use while the agent is still running. */
  isLive?: boolean;
  emptyMessage?: string;
  className?: string;
}

const TONE_DOT: Record<NonNullable<AgentNarrationLine["tone"]>, string> = {
  neutral: "bg-muted-foreground/40",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  error: "bg-rose-400",
};

/**
 * Shared "the agent is talking to you" feed — a vertical stack of assistant
 * chat bubbles, modeled on OnboardingChat.tsx's bubble markup. Mounted by
 * every surface that narrates structured agent status (SME Desk, the
 * Proactive journey/console, Mission Map) so the voice stays consistent.
 */
export function AgentNarrationFeed({
  lines,
  isLive,
  emptyMessage = "Nothing to report yet.",
  className,
}: AgentNarrationFeedProps) {
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lines.length, isLive]);

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setThinkingIdx((i) => (i + 1) % THINKING_LINES.length), 1800);
    return () => clearInterval(id);
  }, [isLive]);

  if (lines.length === 0 && !isLive) {
    return <p className={cn("text-xs leading-5 text-muted-foreground", className)}>{emptyMessage}</p>;
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      {lines.map((line) => (
        <div key={line.id} className="flex items-start gap-2">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </span>
          <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-border bg-card px-3 py-2">
            <p className="text-xs leading-5 text-foreground/90">{line.text}</p>
            {line.at ? (
              <p className="mt-1 text-[10px] text-muted-foreground">{new Date(line.at).toLocaleTimeString()}</p>
            ) : null}
          </div>
          {line.tone ? (
            <span className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[line.tone])} aria-hidden />
          ) : null}
        </div>
      ))}

      {isLive ? (
        <div className="ml-8 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span key={thinkingIdx}>{THINKING_LINES[thinkingIdx]}</span>
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}

export default AgentNarrationFeed;
