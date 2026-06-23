import type { ReactNode } from "react";

import { SectionLabel } from "@/components/studio/agent-ops/shared/SectionLabel";
import { cn } from "@/lib/utils";

type AgentOpsSectionHeaderProps = {
  title: string;
  compact?: boolean;
  trailing?: ReactNode;
  className?: string;
};

export function AgentOpsSectionHeader({ title, compact, trailing, className }: AgentOpsSectionHeaderProps) {
  if (!trailing) {
    return <SectionLabel title={title} compact={compact} />;
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-baseline sm:justify-between",
        className,
      )}
    >
      <SectionLabel title={title} compact={compact} />
      <div className="flex min-w-0 flex-wrap items-center justify-start gap-1.5 sm:justify-end">{trailing}</div>
    </div>
  );
}
