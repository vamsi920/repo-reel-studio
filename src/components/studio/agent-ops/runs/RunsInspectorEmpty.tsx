import { ArrowRight, CheckCircle2, GitPullRequest, ListChecks, SearchCode } from "lucide-react";
import type { ReactNode } from "react";

import { AgentOpsActionButton } from "@/components/studio/agent-ops/shared/AgentOpsActionButton";
import { agentOpsInspectorPanelClass } from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { agentOpsInspectorShellClass } from "@/components/studio/agent-ops/shared/agentOpsLayout";
import { cn } from "@/lib/utils";

export function RunsInspectorEmpty({ onStartRun }: { onStartRun: () => void }) {
  return (
    <AgentOpsPanelShell>
      <div className="mx-auto max-w-3xl py-2 sm:py-4">
        <div className="text-sm font-semibold text-foreground">From issue to reviewed change</div>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
          Start with one scoped GitHub issue. The agent works in an isolated workspace and stops for your approval before promotion.
        </p>

        <ol className="mt-5 grid gap-3 sm:grid-cols-2">
          <LifecycleStep icon={SearchCode} number="01" title="Understand" detail="Read the issue, repository evidence, and project memory." />
          <LifecycleStep icon={ArrowRight} number="02" title="Execute" detail="Plan and change code in an isolated branch workspace." />
          <LifecycleStep icon={ListChecks} number="03" title="Verify" detail="Run checks and expose the patch, commands, and results." />
          <LifecycleStep icon={GitPullRequest} number="04" title="Review and ship" detail="You approve or reject before any PR is opened." />
        </ol>

        <AgentOpsActionButton type="button" intent="primary" size="sm" className="mt-5" onClick={onStartRun}>
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Focus issue URL
        </AgentOpsActionButton>
      </div>
    </AgentOpsPanelShell>
  );
}

function LifecycleStep({
  icon: Icon,
  number,
  title,
  detail,
}: {
  icon: typeof SearchCode;
  number: string;
  title: string;
  detail: string;
}) {
  return (
    <li className="rounded-xl bg-muted/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        <span className="font-mono text-[10px] text-muted-foreground">{number}</span>
      </div>
      <div className="mt-3 text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </li>
  );
}

function AgentOpsPanelShell({ children }: { children: ReactNode }) {
  return (
    <div className={cn(agentOpsInspectorShellClass, agentOpsInspectorPanelClass)}>
      <div className="px-3 py-4 sm:px-5 sm:py-5">{children}</div>
    </div>
  );
}
