import { PlayCircle } from "lucide-react";
import type { RefObject } from "react";

import { AgentOpsAttentionPanel } from "@/components/studio/agent-ops/shared/AgentOpsAttentionPanel";
import { AgentOpsPanel } from "@/components/studio/agent-ops/shared/AgentOpsPanel";
import type { AgentOpsAttention } from "@/lib/agentOpsAttention";
import { parseAgentOpsAttention } from "@/lib/agentOpsAttention";
import { AgentOpsSectionHeader } from "@/components/studio/agent-ops/shared/AgentOpsSectionHeader";
import { agentOpsFieldLabelClass } from "@/components/studio/agent-ops/shared/agentOpsLayout";
import { InlineMeta } from "@/components/studio/agent-ops/shared/InlineMeta";
import {
  AGENT_OPS_ACTION_LABEL,
  startRunDisabledReason,
} from "@/components/studio/agent-ops/shared/agentOpsActions";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { AgentOpsActionButton } from "@/components/studio/agent-ops/shared/AgentOpsActionButton";
import { agentOpsActionMinWidth } from "@/components/studio/agent-ops/shared/agentOpsDimensions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ISSUE_URL_ID = "agent-ops-issue-url";
const BRANCH_ID = "agent-ops-branch-override";
const FORM_ERROR_ID = "agent-ops-run-form-error";

export type IssueRunComposerProps = {
  issueUrl: string;
  branch: string;
  submitting: boolean;
  error: string | null;
  agentBackendAttention: AgentOpsAttention | null;
  isGitHub: boolean;
  runCount: number;
  pendingReview: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onIssueUrlChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onStartRun: () => void;
};

export function IssueRunComposer({
  issueUrl,
  branch,
  submitting,
  error,
  agentBackendAttention,
  isGitHub,
  runCount,
  pendingReview,
  inputRef,
  onIssueUrlChange,
  onBranchChange,
  onStartRun,
}: IssueRunComposerProps) {
  const trimmedUrl = issueUrl.trim();
  const canSubmit = isGitHub && Boolean(trimmedUrl) && !submitting;
  const startDisabledReason = startRunDisabledReason({
    isGitHub,
    hasIssueUrl: Boolean(trimmedUrl),
    submitting,
  });
  const showEmptyHint = isGitHub && !trimmedUrl && !error && !agentBackendAttention;
  const formErrorAttention = error && !agentBackendAttention ? parseAgentOpsAttention(error, "agent") : null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onStartRun();
  };

  return (
    <AgentOpsPanel padding="md" variant="nested">
      <AgentOpsSectionHeader
        title="New run"
        compact
        trailing={
          <>
            <InlineMeta label="Runs" value={String(runCount)} />
            <InlineMeta label="Review" value={String(pendingReview)} />
          </>
        }
      />

      {!isGitHub ? (
        <div
          className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs leading-5 text-rose-700"
          role="alert"
        >
          {AGENT_OPS_COPY.githubOnly}
        </div>
      ) : null}

      <form className="mt-3 space-y-2.5" onSubmit={handleSubmit} noValidate>
        <div className="space-y-1">
          <label htmlFor={ISSUE_URL_ID} className={agentOpsFieldLabelClass}>
            Issue URL
          </label>
          <Input
            id={ISSUE_URL_ID}
            ref={inputRef}
            value={issueUrl}
            className={cn("h-10 text-sm", error && "border-rose-300/35 focus-visible:ring-rose-300/40")}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? FORM_ERROR_ID : undefined}
            disabled={!isGitHub || submitting}
            onChange={(event) => onIssueUrlChange(event.target.value)}
            placeholder="github.com/owner/repo/issues/123"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor={BRANCH_ID} className={agentOpsFieldLabelClass}>
              Branch <span className="font-normal normal-case tracking-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id={BRANCH_ID}
              className="h-10 text-sm"
              value={branch}
              disabled={!isGitHub || submitting}
              onChange={(event) => onBranchChange(event.target.value)}
              placeholder="auto"
            />
          </div>

          <AgentOpsActionButton
            type="submit"
            intent="primary"
            size="sm"
            className={cn("h-10 w-full max-w-full shrink-0 sm:w-auto", agentOpsActionMinWidth.startRun)}
            disabled={!canSubmit}
            disabledReason={startDisabledReason}
            loading={submitting}
            loadingLabel="Starting run…"
          >
            {!submitting ? <PlayCircle className="h-4 w-4 shrink-0" aria-hidden /> : null}
            {AGENT_OPS_ACTION_LABEL.startRun}
          </AgentOpsActionButton>
        </div>

        {formErrorAttention ? (
          <div id={FORM_ERROR_ID}>
            <AgentOpsAttentionPanel attention={formErrorAttention} />
          </div>
        ) : showEmptyHint ? (
          <p className="text-xs leading-5 text-muted-foreground">{AGENT_OPS_COPY.issueUrlHint}</p>
        ) : null}
      </form>
    </AgentOpsPanel>
  );
}
