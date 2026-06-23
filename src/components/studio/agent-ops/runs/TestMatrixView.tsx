import { ValidationStatusBadge } from "@/components/studio/agent-ops/runs/ValidationStatusBadge";
import { statusAriaLabel } from "@/components/studio/agent-ops/shared/agentOpsA11y";
import { AGENT_OPS_COPY } from "@/components/studio/agent-ops/shared/agentOpsCopy";
import { TabEmpty } from "@/components/studio/agent-ops/shared/TabEmpty";
import type { TestMatrix, TestMatrixEntry } from "@/lib/agentRuns";
import { cn } from "@/lib/utils";

type TestMatrixViewProps = {
  testMatrix: TestMatrix | null;
};

export function TestMatrixView({ testMatrix }: TestMatrixViewProps) {
  const suites = testMatrix?.suites ?? [];

  if (!testMatrix || suites.length === 0) {
    return <TabEmpty>{AGENT_OPS_COPY.noTestMatrix}</TabEmpty>;
  }

  const failedCount = suites.filter((suite) => suite.status === "failed" || suite.status === "timeout").length;
  const passRate = Number.isFinite(testMatrix.passRate)
    ? `${Math.round(testMatrix.passRate * 100)}%`
    : "—";

  return (
    <article className="min-w-0 space-y-3" aria-label="Test matrix">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-white/88">Tests</h3>
        <ValidationStatusBadge status={testMatrix.overallStatus} />
        <span className="text-xs text-white/38">
          {suites.length} suite{suites.length === 1 ? "" : "s"} · {passRate} pass · {testMatrix.totalDurationMs}ms
          {failedCount > 0 ? ` · ${failedCount} failed` : ""}
        </span>
      </header>

      <ol className="divide-y divide-white/[0.06] rounded-md border border-white/[0.08]">
        {suites.map((suite, index) => (
          <TestSuiteRow key={`${suite.command}-${suite.suite}-${index}`} suite={suite} />
        ))}
      </ol>
    </article>
  );
}

function TestSuiteRow({ suite }: { suite: TestMatrixEntry }) {
  const failed = suite.status === "failed" || suite.status === "timeout";
  const failureSummary = suite.failureSummary?.trim() || null;
  const impactedFiles = suite.impactedFiles ?? [];

  return (
    <li
      className={cn(
        "min-w-0 px-3 py-2.5",
        failed && "border-l-2 border-rose-400/40 bg-rose-950/[0.1]",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <SuiteStatusChip status={suite.status} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-white/78" title={suite.command}>
          {suite.command}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-white/32">{suite.suite}</span>
        <span className="shrink-0 tabular-nums text-[11px] text-white/36">{suite.durationMs}ms</span>
        <span className="sr-only">exit {suite.exitCode}</span>
      </div>

      {failureSummary ? (
        <pre className="mt-2 max-h-28 overflow-auto rounded border border-rose-400/15 bg-black/20 p-2 font-mono text-[11px] leading-5 text-rose-100/75">
          <code className="block whitespace-pre">{failureSummary}</code>
        </pre>
      ) : null}

      {impactedFiles.length > 0 ? (
        <p className="mt-2 truncate font-mono text-[10px] text-white/40" title={impactedFiles.join(", ")}>
          {impactedFiles.slice(0, 6).join(" · ")}
          {impactedFiles.length > 6 ? ` · +${impactedFiles.length - 6}` : ""}
        </p>
      ) : null}
    </li>
  );
}

function SuiteStatusChip({ status }: { status: TestMatrixEntry["status"] }) {
  const label = humanizeSuiteStatus(status);
  const tone =
    status === "passed"
      ? "bg-emerald-300/10 text-emerald-100"
      : status === "failed"
        ? "border border-rose-400/25 bg-rose-400/10 text-rose-100"
        : status === "timeout"
          ? "border border-amber-400/25 bg-amber-400/10 text-amber-100"
          : "bg-white/[0.06] text-white/50";

  return (
    <span
      aria-label={statusAriaLabel("Suite status", label)}
      className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]", tone)}
    >
      {label}
    </span>
  );
}

function humanizeSuiteStatus(status: TestMatrixEntry["status"]) {
  if (status === "timeout") return "Timed out";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
