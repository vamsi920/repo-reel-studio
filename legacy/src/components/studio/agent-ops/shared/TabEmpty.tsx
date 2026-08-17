import type { ReactNode } from "react";

import { AgentOpsEmptyState, type AgentOpsEmptyAction } from "@/components/studio/agent-ops/shared/AgentOpsEmptyState";

export function TabEmpty({
  message,
  children,
  title,
  action,
}: {
  message?: string;
  children?: ReactNode;
  title?: string;
  action?: AgentOpsEmptyAction;
}) {
  const copy =
    message ?? (typeof children === "string" ? children : "");
  return (
    <AgentOpsEmptyState
      title={title}
      message={copy}
      action={action}
      compact
      className="text-center sm:text-left"
    />
  );
}
