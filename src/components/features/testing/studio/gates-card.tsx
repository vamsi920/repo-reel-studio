import React from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Trash2 } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  useTestStudioStore,
  type TestProject,
} from "#/stores/test-studio-store";
import { DEFAULT_GATES, METRIC_LABELS, defaultOp } from "#/lib/testing/gates";
import {
  GATE_METRICS,
  type GateMetric,
  type GateRule,
  type TestReport,
} from "#/lib/testing/model";

/**
 * The quality contract. Editable until a run starts; every change here is
 * the user's, and the verdict column shows the latest report's reading.
 */
export function GatesCard({
  project,
  report,
}: {
  project: TestProject;
  report?: TestReport;
}) {
  const { t } = useTranslation("openhands");
  const setGates = useTestStudioStore((s) => s.setGates);
  const running = project.runs.some((r) => r.status === "running");
  const [adding, setAdding] = React.useState<GateMetric | "">("");
  const unused = GATE_METRICS.filter(
    (m) => !project.gates.some((g) => g.metric === m),
  );

  const update = (id: string, patch: Partial<GateRule>) =>
    setGates(
      project.id,
      project.gates.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    );
  const remove = (id: string) =>
    setGates(
      project.id,
      project.gates.filter((g) => g.id !== id),
    );
  const add = (metric: GateMetric) => {
    const base = DEFAULT_GATES.find((g) => g.metric === metric);
    setGates(project.id, [
      ...project.gates,
      base
        ? { ...base }
        : {
            id: metric,
            metric,
            op: defaultOp(metric),
            threshold: 0,
            blocking: true,
          },
    ]);
    setAdding("");
  };

  return (
    <section
      data-testid="testing-gates"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ame-eyebrow flex items-center gap-1">
          <ShieldCheck size={12} aria-hidden /> {t(I18nKey.TESTING$GATES_TITLE)}
        </span>
        <button
          type="button"
          disabled={running}
          onClick={() =>
            setGates(
              project.id,
              DEFAULT_GATES.map((g) => ({ ...g })),
            )
          }
          className="ame-btn-ghost ame-btn-xs"
        >
          {t(I18nKey.TESTING$GATES_RESET)}
        </button>
      </div>
      <p className="text-xs text-[var(--text-tertiary)]">
        {t(I18nKey.TESTING$GATES_HINT)}
      </p>
      <ul className="flex flex-col gap-1">
        {project.gates.map((g) => {
          const result = report?.gates.results.find((r) => r.rule.id === g.id);
          return (
            <li
              key={g.id}
              data-testid={`testing-gate-${g.id}`}
              data-verdict={result?.verdict}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 text-xs"
            >
              <span className="truncate text-[var(--text-primary)]">
                {METRIC_LABELS[g.metric]}
              </span>
              <select
                aria-label={t(I18nKey.TESTING$GATE_OP)}
                disabled={running}
                value={g.op}
                onChange={(e) =>
                  update(g.id, { op: e.target.value as GateRule["op"] })
                }
                className="ame-input rounded border border-[var(--border-color)] bg-transparent px-1 py-0.5"
              >
                <option value="<=">{"<="}</option>
                <option value=">=">{">="}</option>
                <option value="==">{"=="}</option>
              </select>
              <input
                type="number"
                aria-label={t(I18nKey.TESTING$GATE_THRESHOLD)}
                disabled={running}
                value={g.threshold}
                onChange={(e) =>
                  update(g.id, { threshold: Number(e.target.value) })
                }
                className="ame-input w-20 rounded border border-[var(--border-color)] bg-transparent px-1 py-0.5"
              />
              <label className="flex items-center gap-1 text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  disabled={running}
                  checked={g.blocking}
                  onChange={(e) => update(g.id, { blocking: e.target.checked })}
                />
                {t(I18nKey.TESTING$GATE_BLOCKING)}
              </label>
              <span className="flex items-center gap-1">
                {result ? (
                  <span
                    className={cn(
                      "ame-badge",
                      result.verdict === "passed" && "ame-badge-success",
                      result.verdict === "failed" && "ame-badge-danger",
                      result.verdict === "warned" && "ame-badge-warning",
                      result.verdict === "not_measured" && "ame-badge-neutral",
                    )}
                  >
                    {result.actual !== undefined ? result.actual : "—"}
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={running}
                  aria-label={t(I18nKey.TESTING$GATE_REMOVE)}
                  onClick={() => remove(g.id)}
                  className="ame-btn-icon ame-btn-icon-sm"
                >
                  <Trash2 size={12} />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {unused.length ? (
        <select
          aria-label={t(I18nKey.TESTING$GATE_ADD)}
          data-testid="testing-gate-add"
          disabled={running}
          value={adding}
          onChange={(e) => {
            const value = e.target.value as GateMetric | "";
            if (value) add(value);
          }}
          className="ame-input self-start rounded border border-[var(--border-color)] bg-transparent px-2 py-1 text-xs"
        >
          <option value="">{t(I18nKey.TESTING$GATE_ADD)}</option>
          {unused.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m]}
            </option>
          ))}
        </select>
      ) : null}
    </section>
  );
}
