import type { ElementType } from "react";
import { cn } from "@/lib/utils";

export const SummaryStatCard = ({
  icon: Icon,
  label,
  value,
  description,
  accentClass,
}: {
  icon: ElementType;
  label: string;
  value: string;
  description: string;
  accentClass: string;
}) => (
  <div className="rounded-[20px] gf-panel-soft p-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className={cn("rounded-2xl p-2", accentClass)}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);
