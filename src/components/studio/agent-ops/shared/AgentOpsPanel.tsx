import type { ReactNode } from "react";

import {
  agentOpsNestedPanelClass,
  agentOpsPanelPaddingMd,
  agentOpsPanelSurfaceClass,
} from "@/components/studio/agent-ops/shared/agentOpsLayout";
import { cn } from "@/lib/utils";

type AgentOpsPanelProps = {
  children: ReactNode;
  className?: string;
  padding?: "none" | "md";
  /** `nested` = sidebar/board stacks; `surface` = primary inspector / detail. */
  variant?: "nested" | "surface";
};

export function AgentOpsPanel({ children, className, padding = "none", variant = "surface" }: AgentOpsPanelProps) {
  return (
    <section
      className={cn(
        variant === "nested" ? agentOpsNestedPanelClass : agentOpsPanelSurfaceClass,
        padding === "md" && agentOpsPanelPaddingMd,
        className,
      )}
    >
      {children}
    </section>
  );
}
