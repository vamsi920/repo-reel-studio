import { useState } from "react";
import { Check, FileDiff, ShieldAlert, X } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { AgentOpsApproval } from "#/api/agentops-service/agentops-service.types";
import { useAgentOpsApprovalDecision } from "#/hooks/query/use-agentops";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { getApiErrorMessage } from "#/utils/api-error-message";
import {
  formatCostUsd,
  formatTimestamp,
  shortWorkspace,
} from "./agentops-formatting";

/**
 * The approvals queue.
 *
 * Two kinds of entry, both backed by something real:
 *
 * - `confirmation` — the OpenHands runtime itself is blocked in
 *   `waiting_for_confirmation` and will not act until answered. Approving or
 *   rejecting calls the agent-server's `respond_to_confirmation` endpoint.
 * - `budget` — the collector halted the run for exceeding a configured budget.
 *   Approving raises the limit and resumes; rejecting leaves it stopped.
 *
 * The queue's shape is deliberately generic (kind + what + why + artifacts) so
 * Proactive can raise entries into it without a new surface.
 */

function riskTone(risk: string | null | undefined): string {
  switch ((risk ?? "").toUpperCase()) {
    case "HIGH":
      return "var(--error-500)";
    case "MEDIUM":
      return "var(--warning-500)";
    case "LOW":
      return "var(--success-500)";
    default:
      return "var(--text-tertiary)";
  }
}

function renderWhat(what: AgentOpsApproval["what"]): string {
  if (what === null || what === undefined) return "—";
  if (typeof what === "string") return what;
  return JSON.stringify(what, null, 2);
}

interface ApprovalCardProps {
  approval: AgentOpsApproval;
}

function ApprovalCard({ approval }: ApprovalCardProps) {
  const { t } = useTranslation("openhands");
  const { mutate: decide, isPending } = useAgentOpsApprovalDecision();
  const [reason, setReason] = useState("");
  const isPendingState = approval.state === "pending";

  const submit = (decision: "approve" | "reject") =>
    decide(
      {
        approvalId: approval.id,
        decision,
        reason: reason.trim() || undefined,
      },
      {
        onError: (error) =>
          displayErrorToast(
            getApiErrorMessage(
              error,
              t(I18nKey.AGENTOPS$CONTROL_FAILED, { action: decision }),
            ),
          ),
      },
    );

  return (
    <article
      data-testid={`agentops-approval-${approval.id}`}
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--background-primary)] p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {approval.title}
          </h3>
          <p className="text-xs text-[var(--text-tertiary)]">
            {approval.agentName} · {shortWorkspace(approval.workspaceId)} ·{" "}
            {formatTimestamp(approval.requestedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {approval.securityRisk ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                color: riskTone(approval.securityRisk),
                backgroundColor: `color-mix(in srgb, ${riskTone(approval.securityRisk)} 12%, transparent)`,
              }}
            >
              <ShieldAlert size={12} />
              {t(I18nKey.AGENTOPS$RISK_BADGE, { risk: approval.securityRisk })}
            </span>
          ) : null}
          <span className="rounded-full bg-[var(--background-tertiary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
            {approval.kind === "budget"
              ? t(I18nKey.AGENTOPS$APPROVAL_KIND_BUDGET)
              : t(I18nKey.AGENTOPS$APPROVAL_KIND_CONFIRMATION)}
          </span>
        </div>
      </header>

      <section className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
          {t(I18nKey.AGENTOPS$APPROVAL_WHAT)}
        </span>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-[var(--background-secondary)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]">
          {renderWhat(approval.what)}
        </pre>
      </section>

      <section className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
          {t(I18nKey.AGENTOPS$APPROVAL_WHY)}
        </span>
        <p className="text-sm text-[var(--text-secondary)]">{approval.why}</p>
      </section>

      {approval.artifacts?.length ? (
        <section className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
            {t(I18nKey.AGENTOPS$APPROVAL_FILES)}
          </span>
          <ul className="flex flex-col gap-0.5">
            {approval.artifacts.map((artifact) => (
              <li
                key={artifact}
                className="flex items-center gap-1.5 font-mono text-xs text-[var(--text-secondary)]"
              >
                <FileDiff size={12} className="shrink-0" />
                <span className="truncate">{artifact}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-color)] pt-3">
        <div className="flex flex-col gap-0.5 text-xs text-[var(--text-tertiary)]">
          <span>
            {t(I18nKey.AGENTOPS$APPROVAL_RUN_COST, {
              cost: formatCostUsd(approval.estimatedCostUsd),
            })}
          </span>
          <Link
            to={`/agentops/runs/${approval.runId}`}
            className="text-[var(--primary-500)] hover:underline"
          >
            {t(I18nKey.AGENTOPS$APPROVAL_OPEN_RUN)}
          </Link>
        </div>

        {isPendingState ? (
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t(I18nKey.AGENTOPS$APPROVAL_REASON_PLACEHOLDER)}
              aria-label={t(I18nKey.AGENTOPS$APPROVAL_REASON_LABEL)}
              className="min-w-[160px] flex-1 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--background-secondary)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            />
            <button
              type="button"
              data-testid={`agentops-approve-${approval.id}`}
              disabled={isPending}
              onClick={() => submit("approve")}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--success-500)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              <Check size={14} />
              {t(I18nKey.AGENTOPS$APPROVAL_APPROVE)}
            </button>
            <button
              type="button"
              data-testid={`agentops-reject-${approval.id}`}
              disabled={isPending}
              onClick={() => submit("reject")}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--error-500)] px-3 py-1.5 text-sm font-medium text-[var(--error-500)] disabled:opacity-50"
            >
              <X size={14} />
              {t(I18nKey.AGENTOPS$APPROVAL_REJECT)}
            </button>
          </div>
        ) : (
          <span className="text-xs text-[var(--text-secondary)]">
            {approval.state === "approved"
              ? t(I18nKey.AGENTOPS$APPROVAL_APPROVED)
              : t(I18nKey.AGENTOPS$APPROVAL_REJECTED)}
            {approval.decidedAt
              ? ` · ${formatTimestamp(approval.decidedAt)}`
              : ""}
            {approval.decisionReason ? ` · ${approval.decisionReason}` : ""}
          </span>
        )}
      </footer>
    </article>
  );
}

interface ApprovalsQueueProps {
  approvals: AgentOpsApproval[];
  emptyMessage: string;
}

export function ApprovalsQueue({
  approvals,
  emptyMessage,
}: ApprovalsQueueProps) {
  if (!approvals.length) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-color)] p-8 text-center text-sm text-[var(--text-secondary)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div data-testid="agentops-approvals-queue" className="flex flex-col gap-3">
      {approvals.map((approval) => (
        <ApprovalCard key={approval.id} approval={approval} />
      ))}
    </div>
  );
}
