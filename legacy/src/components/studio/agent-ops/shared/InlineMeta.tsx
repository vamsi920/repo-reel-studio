import { cn } from "@/lib/utils";

export function InlineMeta({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground",
        className,
      )}
    >
      <span className="uppercase tracking-[0.08em] text-muted-foreground/70">{label}</span>
      <span className="text-foreground/80">{value}</span>
    </span>
  );
}
