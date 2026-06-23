import { RunValidationTab } from "@/components/studio/agent-ops/runs/RunValidationTab";
import { QualityGatesView } from "@/components/studio/agent-ops/runs/QualityGatesView";
import { TestMatrixView } from "@/components/studio/agent-ops/runs/TestMatrixView";
import type { AgentRun } from "@/lib/agentRuns";

type RunChecksTabProps = {
  run: AgentRun;
  onRefreshRun: () => void;
};

export function RunChecksTab({ run, onRefreshRun }: RunChecksTabProps) {
  return (
    <div className="min-w-0 space-y-6">
      <section aria-labelledby="run-checks-validation-heading">
        <h4 id="run-checks-validation-heading" className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/36">
          Validation
        </h4>
        <RunValidationTab validation={run.artifacts.validation} onRefreshRun={onRefreshRun} />
      </section>

      <section aria-labelledby="run-checks-tests-heading">
        <h4 id="run-checks-tests-heading" className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/36">
          Tests
        </h4>
        <TestMatrixView testMatrix={run.artifacts.testMatrix ?? null} />
      </section>

      <section aria-labelledby="run-checks-risk-heading">
        <h4 id="run-checks-risk-heading" className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/36">
          Risk & gates
        </h4>
        <QualityGatesView
          qualityGates={run.artifacts.qualityGates ?? null}
          evaluation={run.evaluation}
          metrics={run.metrics ?? null}
        />
      </section>
    </div>
  );
}
