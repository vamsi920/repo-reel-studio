/** Restrained status badge tones for Agent Ops (runs + proactive). */
export type AgentOpsStatusTone = "neutral" | "info" | "active" | "review" | "success" | "danger" | "muted";

export const AGENT_OPS_STATUS_TONE_CLASS: Record<AgentOpsStatusTone, string> = {
  neutral: "border border-white/10 bg-white/[0.05] text-white/58",
  info: "border border-sky-400/15 bg-sky-400/[0.08] text-sky-100/88",
  active: "border border-sky-400/20 bg-sky-400/10 text-sky-50/92",
  review: "border border-amber-400/18 bg-amber-400/10 text-amber-50/92",
  success: "border border-emerald-400/18 bg-emerald-400/10 text-emerald-50/92",
  danger: "border border-rose-400/18 bg-rose-400/10 text-rose-50/92",
  muted: "border border-white/[0.08] bg-white/[0.03] text-white/42",
};

export const AGENT_OPS_TYPE_TONE_CLASS: Record<AgentOpsStatusTone, string> = {
  neutral: "border border-white/10 bg-white/[0.04] text-white/52",
  info: "border border-sky-400/12 bg-sky-400/[0.06] text-sky-100/80",
  active: "border border-sky-400/15 bg-sky-400/[0.07] text-sky-100/82",
  review: "border border-amber-400/14 bg-amber-400/[0.07] text-amber-100/82",
  success: "border border-emerald-400/14 bg-emerald-400/[0.07] text-emerald-100/82",
  danger: "border border-rose-400/14 bg-rose-400/[0.07] text-rose-100/82",
  muted: "border border-white/[0.08] bg-white/[0.03] text-white/40",
};

export const AGENT_OPS_STATUS_BADGE_BASE =
  "inline-flex max-w-full min-w-0 shrink items-center truncate rounded px-1.5 py-0.5 font-semibold uppercase tracking-[0.08em]";

export const AGENT_OPS_STATUS_BADGE_SIZE = {
  sm: "text-[9px] leading-none",
  md: "text-[10px] leading-none",
} as const;
