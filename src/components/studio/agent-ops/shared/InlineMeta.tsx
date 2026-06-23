import { cn } from "@/lib/utils";

export function InlineMeta({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium tabular-nums text-white/48",
        className,
      )}
    >
      <span className="uppercase tracking-[0.08em] text-white/32">{label}</span>
      <span className="text-white/72">{value}</span>
    </span>
  );
}
