import { cn } from "@/lib/utils";

export function SectionLabel({ title, compact = false }: { title: string; compact?: boolean }) {
  return (
    <div className={cn("text-[11px] font-semibold uppercase tracking-[0.2em] text-white/34", compact && "text-[10px]")}>
      {title}
    </div>
  );
}
