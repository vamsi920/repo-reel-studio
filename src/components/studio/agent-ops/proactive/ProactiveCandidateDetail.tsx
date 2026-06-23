import { useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import { CandidateStatusPill } from "@/components/studio/agent-ops/proactive/CandidateStatusPill";
import { CandidateTypeChip } from "@/components/studio/agent-ops/proactive/CandidateTypeChip";
import { PolicyBanner } from "@/components/studio/agent-ops/proactive/PolicyBanner";
import { ProactiveCandidateFactStrip } from "@/components/studio/agent-ops/proactive/ProactiveCandidateFactStrip";
import { ProactiveInspectorTabBar } from "@/components/studio/agent-ops/proactive/ProactiveInspectorTabBar";
import { ProactiveLiveConsole } from "@/components/studio/agent-ops/proactive/ProactiveLiveConsole";
import {
  proactiveInspectorPanelId,
  proactiveInspectorTabId,
  type ProactiveInspectorTab,
} from "@/components/studio/agent-ops/proactive/proactiveInspectorTabs";
import { candidateScorePercent } from "@/components/studio/agent-ops/proactive/proactiveCandidateDisplay";
import { RunValidationTab } from "@/components/studio/agent-ops/runs/RunValidationTab";
import { TestMatrixView } from "@/components/studio/agent-ops/runs/TestMatrixView";
import { AgentOpsPanel } from "@/components/studio/agent-ops/shared/AgentOpsPanel";
import { AGENT_OPS_ACTION_LABEL } from "@/components/studio/agent-ops/shared/agentOpsActions";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { AgentOpsActionButton } from "@/components/studio/agent-ops/shared/AgentOpsActionButton";
import { AgentOpsEmptyState } from "@/components/studio/agent-ops/shared/AgentOpsEmptyState";
import { agentOpsChevronClass, agentOpsTransitionClass } from "@/components/studio/agent-ops/shared/agentOpsMotion";
import { TabEmpty } from "@/components/studio/agent-ops/shared/TabEmpty";
import type { AgentRun, TestMatrix } from "@/lib/agentRuns";
import type { ProactiveCandidate, ProactiveStatus } from "@/lib/proactiveAgentOps";
import { cn } from "@/lib/utils";

export type ProactiveCandidateDetailProps = {
  candidate: ProactiveCandidate | null;
  batch: ProactiveStatus["batch"] | null;
  onSelectRun: (candidate: ProactiveCandidate) => void;
  onRefresh: () => void;
};

export function ProactiveCandidateDetail({
  candidate,
  batch,
  onSelectRun,
  onRefresh,
}: ProactiveCandidateDetailProps) {
  const [activeTab, setActiveTab] = useState<ProactiveInspectorTab>("overview");

  if (!candidate) {
    return (
      <AgentOpsPanel className="min-w-0 max-w-full">
        <div className="px-3 py-4 sm:px-4 sm:py-5">
          <AgentOpsEmptyState
            title={AGENT_OPS_COPY.noCandidateSelectedTitle}
            message={AGENT_OPS_COPY.noCandidateSelectedMessage}
          />
        </div>
      </AgentOpsPanel>
    );
  }

  const linkedRun = candidate.linkedRun ?? null;
  const validation = linkedRun?.validation ?? { overallStatus: "not_run", commands: [], notes: [] };
  const changedFiles = linkedRun?.changedFiles ?? [];
  const testMatrix = linkedRun?.testMatrix ?? null;
  const qualityGates = linkedRun?.qualityGates ?? null;
  const evidence = candidate.evidence.filter((item) => item?.trim());
  const policyMessages = [
    ...(candidate.policyViolations ?? []),
    ...(candidate.policyWarnings ?? []),
    ...(linkedRun?.policyViolations ?? []),
    ...(linkedRun?.policyWarnings ?? []),
  ].filter((item, index, list) => list.indexOf(item) === index);
  const policyBlocked =
    Boolean(candidate.prApprovalBlocked) ||
    candidate.policyStatus === "blocked" ||
    Boolean(linkedRun?.prApprovalBlocked);
  const policyWarning =
    !policyBlocked &&
    (candidate.policyStatus === "warning" ||
      Boolean(candidate.prPromotionDiscouraged) ||
      Boolean(linkedRun?.prPromotionDiscouraged));

  return (
    <AgentOpsPanel className="min-w-0 max-w-full">
      <header className="border-b border-white/[0.06] px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-white/35">Inspection</p>
            <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-white">{candidate.title}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <CandidateTypeChip type={candidate.type} />
              <CandidateStatusPill status={candidate.status} executionFailure={candidate.executionFailure} />
              <span className="text-xs tabular-nums text-white/45">Score {candidateScorePercent(candidate)}</span>
            </div>
          </div>
          {candidate.runId ? (
            <AgentOpsActionButton
              type="button"
              intent="secondary"
              size="sm"
              className="h-9 w-full max-w-full gap-1 px-2.5 text-[11px] sm:h-8 sm:w-auto sm:shrink-0"
              onClick={() => onSelectRun(candidate)}
            >
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              {AGENT_OPS_ACTION_LABEL.openLinkedRun}
            </AgentOpsActionButton>
          ) : null}
        </div>
      </header>

      {(policyBlocked || policyWarning || policyMessages.length > 0) && (
        <PolicyBanner
          status={policyBlocked ? "blocked" : policyWarning ? "warning" : "clear"}
          summary={candidate.policySummary ?? linkedRun?.policySummary ?? null}
          messages={policyMessages}
        />
      )}

      <ProactiveCandidateFactStrip
        candidate={candidate}
        onOpenTab={(tab) => setActiveTab(tab)}
      />

      <ProactiveInspectorTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      <div
        id={proactiveInspectorPanelId(activeTab)}
        role="tabpanel"
        aria-labelledby={proactiveInspectorTabId(activeTab)}
        className="min-h-[10rem] px-4 py-3 sm:py-4"
      >
        {activeTab === "overview" && (
          <div className="space-y-3">
            <p className="text-xs leading-5 text-white/55">{candidate.hypothesis}</p>

            {evidence.length > 0 ? (
              <DisclosureSection
                title={`Evidence (${evidence.length})`}
                defaultOpen={evidence.length <= 2}
              >
                <ul className="space-y-1.5">
                  {evidence.map((item) => (
                    <li key={item} className="flex gap-2 text-xs leading-5 text-white/58">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-300/80" aria-hidden />
                      <span className="min-w-0">{item}</span>
                    </li>
                  ))}
                </ul>
              </DisclosureSection>
            ) : (
              <TabEmpty
                message={AGENT_OPS_COPY.evidenceEmpty}
                action={{ label: AGENT_OPS_COPY.refresh, onClick: onRefresh }}
              />
            )}

            <DisclosureSection title="Linked run" defaultOpen>
              {linkedRun ? (
                <div className="space-y-1.5">
                  <MetaRow label="Status" value={linkedRun.status} />
                  <MetaRow label="Stage" value={candidate.stage ?? "—"} />
                  <MetaRow label="Patch" value={linkedRun.hasPatch ? "Captured" : "Pending"} />
                  {linkedRun.issueTitle ? <MetaRow label="Issue" value={linkedRun.issueTitle} /> : null}
                </div>
              ) : (
                <TabEmpty
                  title="No linked run"
                  message={AGENT_OPS_COPY.linkedRunEmpty}
                  action={{ label: AGENT_OPS_COPY.refresh, onClick: onRefresh }}
                />
              )}
            </DisclosureSection>
          </div>
        )}

        {activeTab === "checks" && (
          <div className="space-y-4">
            <section aria-labelledby="proactive-checks-validation">
              <h4 id="proactive-checks-validation" className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/36">
                Validation
              </h4>
              {linkedRun ? (
                <RunValidationTab
                  validation={validation}
                  onRefreshRun={() => onSelectRun(candidate)}
                  emptyActionLabel="Open linked run"
                />
              ) : (
                <TabEmpty
                  title="No validation"
                  message={AGENT_OPS_COPY.validationOnRun}
                  action={{ label: AGENT_OPS_COPY.refresh, onClick: onRefresh }}
                />
              )}
            </section>

            {changedFiles.length > 0 ? (
              <DisclosureSection title={`Changed files (${changedFiles.length})`} defaultOpen={changedFiles.length <= 6}>
                <ul className="divide-y divide-white/[0.06] font-mono text-[11px]">
                  {changedFiles.slice(0, 20).map((file) => (
                    <li key={file.path} className="flex min-w-0 items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0 break-all text-white/72 sm:break-normal sm:truncate" title={file.path}>
                        {file.sensitive ? "[sensitive] " : ""}
                        {file.path}
                      </span>
                      <span className="shrink-0 tabular-nums text-white/35">
                        +{file.additions}/-{file.deletions}
                      </span>
                    </li>
                  ))}
                </ul>
                {changedFiles.length > 20 ? (
                  <p className="mt-1 text-[10px] text-white/35">+{changedFiles.length - 20} more files</p>
                ) : null}
              </DisclosureSection>
            ) : null}

            {testMatrix && testMatrix.suites.length > 0 ? (
              <DisclosureSection title="Tests" defaultOpen>
                <TestMatrixView
                  testMatrix={{
                    suites: testMatrix.suites.map((suite) => ({
                      suite: suite.suite,
                      command: suite.command,
                      status: suite.status as TestMatrix["suites"][number]["status"],
                      durationMs: suite.durationMs,
                      exitCode: suite.exitCode,
                      failureSummary: suite.failureSummary,
                      impactedFiles: suite.impactedFiles,
                      logRef: suite.logRef,
                    })),
                    overallStatus: testMatrix.overallStatus as TestMatrix["overallStatus"],
                    totalDurationMs: testMatrix.totalDurationMs,
                    passRate: testMatrix.passRate,
                  }}
                />
              </DisclosureSection>
            ) : null}

            {qualityGates && qualityGates.gates.length > 0 ? (
              <DisclosureSection title="Quality gates" defaultOpen>
                <QualityGatesSummary
                  qualityGates={qualityGates}
                  evaluation={linkedRun?.evaluation as AgentRun["evaluation"] | undefined}
                />
              </DisclosureSection>
            ) : null}

            {linkedRun?.diffStat ? (
              <DisclosureSection title="Patch stat">
                <pre className="max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-white/62">
                  <code>{linkedRun.diffStat}</code>
                </pre>
              </DisclosureSection>
            ) : null}
          </div>
        )}

        {activeTab === "log" && <ProactiveLiveConsole candidate={candidate} batch={batch} />}
      </div>
    </AgentOpsPanel>
  );
}

function DisclosureSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn("group rounded-lg border border-white/[0.06] bg-white/[0.02]", agentOpsTransitionClass)}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/36 [&::-webkit-details-marker]:hidden",
          agentOpsTransitionClass,
        )}
      >
        {title}
        <span
          className={cn(
            "text-white/30 transition group-open:rotate-180",
            agentOpsChevronClass,
          )}
          aria-hidden
        >
          ▾
        </span>
      </summary>
      <div className="border-t border-white/[0.05] px-3 py-2.5">{children}</div>
    </details>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 text-xs">
      <span className="shrink-0 text-white/38">{label}</span>
      <span className="min-w-0 truncate text-right text-white/72">{value}</span>
    </div>
  );
}

function QualityGatesSummary({
  qualityGates,
  evaluation,
}: {
  qualityGates: NonNullable<ProactiveCandidate["linkedRun"]>["qualityGates"];
  evaluation?: AgentRun["evaluation"];
}) {
  if (!qualityGates) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 font-medium capitalize",
            qualityGates.allPassed
              ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
              : "border-amber-300/25 bg-amber-300/10 text-amber-100",
          )}
        >
          {qualityGates.recommendation}
        </span>
        <span className="text-white/38">{qualityGates.allPassed ? "All passed" : "Needs attention"}</span>
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {qualityGates.gates.map((gate) => (
          <li key={gate.gate} className="flex min-w-0 items-center justify-between gap-2 py-1.5 text-xs">
            <span className="text-white/65">{gate.gate}</span>
            <span
              className={cn(
                "shrink-0 font-medium uppercase tracking-[0.06em]",
                gate.status === "passed" || gate.status === "pass" ? "text-emerald-200/90" : "text-amber-200/90",
              )}
            >
              {gate.status}
            </span>
          </li>
        ))}
      </ul>
      {evaluation?.riskLevel ? (
        <p className="text-[11px] text-white/40">
          Risk {evaluation.riskLevel}
          {evaluation.confidenceLevel ? ` · Confidence ${evaluation.confidenceLevel}` : ""}
        </p>
      ) : null}
    </div>
  );
}
