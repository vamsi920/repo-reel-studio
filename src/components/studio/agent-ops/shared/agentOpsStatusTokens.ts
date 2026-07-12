/** Restrained status badge tones for Agent Ops (runs + proactive). */
export type AgentOpsStatusTone = "neutral" | "info" | "active" | "review" | "success" | "danger" | "muted";

export const AGENT_OPS_STATUS_TONE_CLASS: Record<AgentOpsStatusTone, string> = {
  neutral: "border border-border bg-muted text-muted-foreground",
  info: "border border-sky-200 bg-sky-50 text-sky-700",
  active: "border border-sky-200 bg-sky-50 text-sky-700",
  review: "border border-amber-200 bg-amber-50 text-amber-700",
  success: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border border-rose-200 bg-rose-50 text-rose-700",
  muted: "border border-border bg-muted/60 text-muted-foreground/70",
};

export const AGENT_OPS_TYPE_TONE_CLASS: Record<AgentOpsStatusTone, string> = {
  neutral: "border border-border bg-muted/80 text-muted-foreground",
  info: "border border-sky-200 bg-sky-50/70 text-sky-700",
  active: "border border-sky-200 bg-sky-50/70 text-sky-700",
  review: "border border-amber-200 bg-amber-50/70 text-amber-700",
  success: "border border-emerald-200 bg-emerald-50/70 text-emerald-700",
  danger: "border border-rose-200 bg-rose-50/70 text-rose-700",
  muted: "border border-border bg-muted/50 text-muted-foreground/70",
};

export const AGENT_OPS_STATUS_BADGE_BASE =
  "inline-flex max-w-full min-w-0 shrink items-center truncate rounded px-1.5 py-0.5 font-semibold uppercase tracking-[0.08em]";

export const AGENT_OPS_STATUS_BADGE_SIZE = {
  sm: "text-[9px] leading-none",
  md: "text-[10px] leading-none",
} as const;
