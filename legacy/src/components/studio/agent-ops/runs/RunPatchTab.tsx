import type { ReactNode } from "react";

import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { AgentOpsSpinner } from "@/components/studio/agent-ops/shared/AgentOpsSpinner";
import {
  agentOpsCodeShellClass,
  agentOpsCodeViewportLgClass,
  agentOpsCodeViewportSmClass,
} from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { AgentOpsEmptyState } from "@/components/studio/agent-ops/shared/AgentOpsEmptyState";
import { TabEmpty } from "@/components/studio/agent-ops/shared/TabEmpty";
import { cn } from "@/lib/utils";

type RunPatchTabProps = {
  diffStat: string;
  patch: string;
  isRunActive: boolean;
  onOpenSummary?: () => void;
};

const CODE_BLOCK =
  "overflow-x-auto font-mono text-[11px] leading-5 text-white/78 [overflow-wrap:normal] [word-break:normal]";
const SHELL = agentOpsCodeShellClass;

export function RunPatchTab({ diffStat, patch, isRunActive, onOpenSummary }: RunPatchTabProps) {
  const patchText = patch ?? "";
  const statText = diffStat ?? "";
  const hasPatch = patchText.length > 0;
  const hasDiffStat = statText.length > 0;
  const awaitingPatch = isRunActive && !hasPatch;

  return (
    <article className="min-w-0 space-y-4">
      <PatchSection title="Diff stat" hint="File counts from sandbox.">
        {hasDiffStat ? (
          <CodeScrollViewport viewportClass={agentOpsCodeViewportSmClass}>
            <pre className={cn(CODE_BLOCK, "p-3")}>
              <code className="block whitespace-pre">{statText}</code>
            </pre>
          </CodeScrollViewport>
        ) : awaitingPatch ? (
          <PatchPlaceholder icon="loading" message="Diff stat pending." />
        ) : (
          <TabEmpty
            title="No diff stat"
            message="No file summary stored."
            action={onOpenSummary ? { label: "View summary", onClick: onOpenSummary } : undefined}
          />
        )}
      </PatchSection>

      <PatchSection title="Patch" hint="Unified diff from run artifact.">
        {hasPatch ? (
          <CodeScrollViewport viewportClass={agentOpsCodeViewportLgClass}>
            <pre className={cn(CODE_BLOCK, "p-3")}>
              <code className="block whitespace-pre">{patchText}</code>
            </pre>
          </CodeScrollViewport>
        ) : awaitingPatch ? (
          <PatchPlaceholder
            icon="loading"
            message="Patch in progress. See Summary for status."
            action={onOpenSummary ? { label: "View summary", onClick: onOpenSummary } : undefined}
          />
        ) : (
          <TabEmpty
            title="No patch"
            message="No diff stored. Retry the run or check Summary."
            action={onOpenSummary ? { label: "View summary", onClick: onOpenSummary } : undefined}
          />
        )}
      </PatchSection>
    </article>
  );
}

function PatchSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function CodeScrollViewport({
  viewportClass,
  children,
}: {
  viewportClass: string;
  children: ReactNode;
}) {
  return <div className={cn(SHELL, viewportClass)}>{children}</div>;
}

function PatchPlaceholder({
  message,
  icon,
  action,
}: {
  message: string;
  icon?: "loading";
  action?: { label: string; onClick: () => void };
}) {
  return (
    <AgentOpsEmptyState message={message} action={action} compact>
      {icon === "loading" ? (
        <AgentOpsSpinner className="h-3.5 w-3.5 text-muted-foreground" />
      ) : null}
    </AgentOpsEmptyState>
  );
}
