import type { ReactNode } from "react";

import type { AgentOpsActionIntent } from "@/components/studio/agent-ops/shared/AgentOpsActionButton";
import { AgentOpsActionButton } from "@/components/studio/agent-ops/shared/AgentOpsActionButton";
import { cn } from "@/lib/utils";

export type AgentOpsEmptyAction =
  | {
      label: string;
      onClick: () => void;
      intent?: AgentOpsActionIntent;
    }
  | {
      label: string;
      href: string;
      external?: boolean;
      intent?: AgentOpsActionIntent;
    };

export type AgentOpsEmptyStateProps = {
  title?: string;
  message: string;
  action?: AgentOpsEmptyAction;
  compact?: boolean;
  className?: string;
  children?: ReactNode;
};

export function AgentOpsEmptyState({
  title,
  message,
  action,
  compact = false,
  className,
  children,
}: AgentOpsEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-2.5 rounded-md border border-dashed border-white/[0.1] bg-white/[0.02] text-left",
        compact ? "px-3 py-3" : "px-3 py-4 sm:px-4 sm:py-5",
        className,
      )}
    >
      {title ? <p className="text-xs font-semibold text-white/68">{title}</p> : null}
      <p className="text-xs leading-5 text-white/42">{message}</p>
      {children}
      {action ? <EmptyActionButton action={action} /> : null}
    </div>
  );
}

function EmptyActionButton({ action }: { action: AgentOpsEmptyAction }) {
  const intent = action.intent ?? "secondary";

  if ("href" in action) {
    return (
      <AgentOpsActionButton intent={intent} size="sm" className="h-8 w-full sm:w-auto" asChild>
        <a
          href={action.href}
          target={action.external ? "_blank" : undefined}
          rel={action.external ? "noreferrer" : undefined}
        >
          {action.label}
        </a>
      </AgentOpsActionButton>
    );
  }

  return (
    <AgentOpsActionButton
      type="button"
      intent={intent}
      size="sm"
      className="h-8 w-full sm:w-auto"
      onClick={action.onClick}
    >
      {action.label}
    </AgentOpsActionButton>
  );
}
