import type { RunDetailTab } from "@/components/studio/agent-ops/runs/runInspectorTabs";
import { agentOpsTransitionClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";
import { cn } from "@/lib/utils";

type AgentOpsFactChipProps = {
  label: string;
  /** Shown below `sm` when horizontal fact strip scrolls on narrow phones. */
  shortLabel?: string;
  value: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
  onClick?: () => void;
  tabTarget?: RunDetailTab;
  onOpenTab?: (tab: RunDetailTab) => void;
};

const TONE_CLASS = {
  neutral: "border-white/10 bg-white/[0.04] text-white/62",
  ok: "border-emerald-300/22 bg-emerald-300/[0.07] text-emerald-100/90",
  warn: "border-amber-300/22 bg-amber-300/[0.08] text-amber-100/90",
  danger: "border-rose-300/22 bg-rose-300/[0.08] text-rose-100/90",
} as const;

export function AgentOpsFactChip({
  label,
  shortLabel,
  value,
  tone = "neutral",
  onClick,
  tabTarget,
  onOpenTab,
}: AgentOpsFactChipProps) {
  const interactive = Boolean(onClick || (tabTarget && onOpenTab));
  const handleClick = () => {
    if (onClick) onClick();
    else if (tabTarget && onOpenTab) onOpenTab(tabTarget);
  };

  const className = cn(
    "inline-flex max-w-[min(100%,14rem)] shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] leading-none sm:max-w-full sm:gap-1.5 sm:px-2 sm:text-[11px]",
    TONE_CLASS[tone],
    agentOpsTransitionClass,
    interactive && "cursor-pointer hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
  );

  if (interactive) {
    return (
      <button type="button" className={className} onClick={handleClick}>
        <FactChipContent label={label} shortLabel={shortLabel} value={value} />
      </button>
    );
  }

  return (
    <span className={className}>
      <FactChipContent label={label} shortLabel={shortLabel} value={value} />
    </span>
  );
}

function FactChipContent({
  label,
  shortLabel,
  value,
}: {
  label: string;
  shortLabel?: string;
  value: string;
}) {
  const compact = shortLabel ?? label;
  return (
    <>
      <span className="shrink-0 uppercase tracking-[0.06em] text-white/32 sm:tracking-[0.08em]">
        <span className="sm:hidden">{compact}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
      <span className="min-w-0 max-w-[5.5rem] truncate font-medium tabular-nums sm:max-w-none">{value}</span>
    </>
  );
}
