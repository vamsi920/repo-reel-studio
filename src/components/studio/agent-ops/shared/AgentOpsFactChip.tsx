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
  neutral: "border-border bg-muted/70 text-muted-foreground",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
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
    interactive && "cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
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
      <span className="shrink-0 uppercase tracking-[0.06em] text-muted-foreground/70 sm:tracking-[0.08em]">
        <span className="sm:hidden">{compact}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
      <span className="min-w-0 max-w-[5.5rem] truncate font-medium tabular-nums sm:max-w-none">{value}</span>
    </>
  );
}
