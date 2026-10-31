import React from "react";
import { useTranslation } from "react-i18next";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  Server,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { TestProject } from "#/stores/test-studio-store";
import {
  KIND_LABELS,
  TEST_KINDS,
  type SuitePlan,
  type TestKind,
} from "#/lib/testing/model";

/* ── Stack card ────────────────────────────────────────────────────────── */

export function StackCard({ project }: { project: TestProject }) {
  const { t } = useTranslation("openhands");
  const { stack } = project;
  return (
    <section
      data-testid="testing-stack"
      className="ame-card flex flex-col gap-2 p-4"
    >
      <span className="ame-eyebrow flex items-center gap-1">
        <Server size={12} aria-hidden /> {t(I18nKey.TESTING$STACK_TITLE)}
      </span>
      {!stack ? (
        <p className="text-sm text-[var(--text-secondary)]">
          {t(I18nKey.TESTING$STACK_EMPTY)}
        </p>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap gap-1">
            {stack.languages.map((l) => (
              <span key={l} className="ame-badge ame-badge-primary">
                {l}
              </span>
            ))}
            {stack.frameworks.map((f) => (
              <span key={f} className="ame-badge ame-badge-neutral">
                {f}
              </span>
            ))}
            {stack.runners.map((r) => (
              <span key={r} className="ame-badge ame-badge-success">
                {r}
              </span>
            ))}
          </div>
          {stack.appStart ? (
            <p className="font-mono text-xs text-[var(--text-secondary)]">
              $ {stack.appStart.command} → {stack.appStart.url}
            </p>
          ) : null}
          {stack.existingSuites.length ? (
            <ul className="flex flex-col gap-0.5 text-xs text-[var(--text-secondary)]">
              {stack.existingSuites.map((s) => (
                <li key={`${s.kind}-${s.name}`}>
                  <span className="ame-badge ame-badge-neutral mr-1">
                    {KIND_LABELS[s.kind]}
                  </span>
                  {s.name}
                  {s.command ? (
                    <span className="ml-1 font-mono text-[var(--text-tertiary)]">
                      {s.command}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {stack.dataSources.length ? (
            <p className="text-xs text-[var(--text-tertiary)]">
              {t(I18nKey.TESTING$STACK_DATA)}: {stack.dataSources.join(", ")}
            </p>
          ) : null}
          {stack.notes ? (
            <p className="text-xs text-[var(--text-secondary)]">
              {stack.notes}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/* ── Plan card ─────────────────────────────────────────────────────────── */

const STATUS_BADGE: Record<string, string> = {
  pending: "ame-badge ame-badge-neutral",
  running: "ame-badge ame-badge-primary",
  passed: "ame-badge ame-badge-success",
  failed: "ame-badge ame-badge-danger",
  error: "ame-badge ame-badge-danger",
  timeout: "ame-badge ame-badge-warning",
  skipped: "ame-badge ame-badge-neutral",
};

function SuiteRow({
  suite,
  status,
  busy,
  onRun,
}: {
  suite: SuitePlan;
  status?: string;
  busy: boolean;
  onRun?: (id: string) => void;
}) {
  const { t } = useTranslation("openhands");
  const [open, setOpen] = React.useState(false);
  return (
    <li
      data-testid={`testing-suite-${suite.id}`}
      data-status={status}
      className="flex flex-col gap-1 rounded-[var(--radius-sm)] border border-[var(--border-color)] p-2"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="ame-btn-icon ame-btn-icon-sm"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">
          {suite.name}
        </span>
        {suite.notApplicable ? (
          <span className="ame-badge ame-badge-neutral">
            {t(I18nKey.TESTING$NOT_APPLICABLE)}
          </span>
        ) : status ? (
          <span
            className={STATUS_BADGE[status] ?? "ame-badge ame-badge-neutral"}
          >
            {status === "running" ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : null}{" "}
            {status}
          </span>
        ) : null}
        <span className="ame-badge ame-badge-neutral">
          {suite.origin === "agent"
            ? t(I18nKey.TESTING$ORIGIN_AGENT)
            : t(I18nKey.TESTING$ORIGIN_EXISTING)}
        </span>
        {onRun && !suite.notApplicable ? (
          <button
            type="button"
            data-testid={`testing-run-${suite.id}`}
            disabled={busy}
            aria-label={t(I18nKey.TESTING$RUN_SUITE)}
            title={t(I18nKey.TESTING$RUN_SUITE)}
            onClick={() => onRun(suite.id)}
            className="ame-btn-icon ame-btn-icon-sm ame-btn-icon-primary"
          >
            <Play size={12} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="flex flex-col gap-1 pl-7 text-xs text-[var(--text-secondary)]">
          {suite.notApplicable ? (
            <p>{suite.notApplicable}</p>
          ) : (
            <>
              <code className="whitespace-pre-wrap break-all font-mono text-[11px]">
                $ {suite.command}
              </code>
              {suite.results.length ? (
                <p className="text-[var(--text-tertiary)]">
                  {t(I18nKey.TESTING$SUITE_RESULTS)}:{" "}
                  {suite.results
                    .map((r) => `${r.path} (${r.format})`)
                    .join(", ")}
                </p>
              ) : (
                <p className="text-[var(--warning-600,#b45309)]">
                  {t(I18nKey.TESTING$SUITE_NO_RESULTS)}
                </p>
              )}
              {suite.timeoutSec ? (
                <p className="text-[var(--text-tertiary)]">
                  {t(I18nKey.TESTING$SUITE_TIMEOUT, {
                    seconds: suite.timeoutSec,
                  })}
                </p>
              ) : null}
            </>
          )}
          {suite.rationale ? <p>{suite.rationale}</p> : null}
          {suite.evidence?.length ? (
            <p className="font-mono text-[11px] text-[var(--text-tertiary)]">
              {suite.evidence.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function PlanCard({
  project,
  busy,
  canRun,
  onRun,
}: {
  project: TestProject;
  busy: boolean;
  /** False without a runtime: the buttons are hidden, not disabled. */
  canRun: boolean;
  onRun: (suiteIds?: string[]) => void;
}) {
  const { t } = useTranslation("openhands");
  const running = project.runs.find((r) => r.status === "running");
  const byKind = TEST_KINDS.map((kind) => ({
    kind,
    suites: project.plan.filter((s) => s.kind === kind),
  })).filter((g) => g.suites.length);
  const missing = TEST_KINDS.filter(
    (k: TestKind) => !project.plan.some((s) => s.kind === k),
  );
  const applicable = project.plan.filter((s) => !s.notApplicable);
  return (
    <section
      data-testid="testing-plan"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ame-eyebrow flex items-center gap-1">
          <Boxes size={12} aria-hidden /> {t(I18nKey.TESTING$PLAN_TITLE)}
        </span>
        {canRun && applicable.length ? (
          <button
            type="button"
            data-testid="testing-run-all"
            disabled={busy || Boolean(running)}
            onClick={() => onRun()}
            className="ame-btn-primary ame-btn-xs"
          >
            {running ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : (
              <Play size={12} aria-hidden />
            )}{" "}
            {running ? t(I18nKey.TESTING$RUNNING) : t(I18nKey.TESTING$RUN_ALL)}
          </button>
        ) : null}
      </div>
      {project.plan.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">
          {t(I18nKey.TESTING$PLAN_EMPTY)}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {byKind.map(({ kind, suites }) => (
            <div key={kind} className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                {KIND_LABELS[kind]}
              </span>
              <ul className="flex flex-col gap-1">
                {suites.map((suite) => (
                  <SuiteRow
                    key={suite.id}
                    suite={suite}
                    status={running?.progress[suite.id]}
                    busy={busy || Boolean(running)}
                    onRun={canRun ? (id) => onRun([id]) : undefined}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {missing.length ? (
        <p
          data-testid="testing-plan-missing"
          className={cn("text-xs text-[var(--text-tertiary)]")}
        >
          {t(I18nKey.TESTING$PLAN_MISSING)}:{" "}
          {missing.map((k) => KIND_LABELS[k]).join(", ")}
        </p>
      ) : null}
    </section>
  );
}
