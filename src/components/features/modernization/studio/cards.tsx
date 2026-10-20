import React from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  CircleDashed,
  FileText,
  Loader2,
  ShieldAlert,
  XCircle,
  MinusCircle,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  useModernizationStudioStore,
  type ApprovalRequest,
  type ChoiceQuestion,
  type MigrationReport,
  type ModernizationProject,
  type PlanStep,
  type StackComponent,
} from "#/stores/modernization-studio-store";
import {
  MIGRATION_PHASES,
  type MigrationPhase,
} from "#/constants/modernization-control";
import { receipt, type PostResultFn } from "#/services/modernization-control";
import { TechLogo, techLabel } from "../tech-logos";

export const PHASE_LABEL_KEY: Record<MigrationPhase, I18nKey> = {
  understand: I18nKey.NEOME$PHASE_UNDERSTAND,
  interview: I18nKey.NEOME$PHASE_INTERVIEW,
  specify: I18nKey.NEOME$PHASE_SPECIFY,
  characterize: I18nKey.NEOME$PHASE_CHARACTERIZE,
  scaffold: I18nKey.NEOME$PHASE_SCAFFOLD,
  migrate: I18nKey.NEOME$PHASE_MIGRATE,
  data: I18nKey.NEOME$PHASE_DATA,
  verify: I18nKey.NEOME$PHASE_VERIFY,
  report: I18nKey.NEOME$PHASE_REPORT,
};

/* ── Stack map ─────────────────────────────────────────────────────────── */

export function StackCard({ components }: { components: StackComponent[] }) {
  const { t } = useTranslation("openhands");
  return (
    <section
      data-testid="neome-stack"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <span className="ame-eyebrow">{t(I18nKey.NEOME$STACK_TITLE)}</span>
      {components.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">
          {t(I18nKey.NEOME$STACK_EMPTY)}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {components.map((c) => (
            <li
              key={c.id}
              data-testid={`neome-component-${c.id}`}
              className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border-color)] p-2.5"
            >
              <TechLogo
                id={c.logo ?? c.framework ?? c.language}
                kind={c.kind}
                size={22}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {c.name}
                </span>
                <span className="truncate text-xs text-[var(--text-tertiary)]">
                  {[c.kind, c.framework ?? c.language, c.version]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {c.target ? (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    <ArrowRight size={12} aria-hidden />
                    <TechLogo
                      id={
                        c.target.logo ?? c.target.framework ?? c.target.language
                      }
                      size={14}
                    />
                    {techLabel(c.target.framework ?? c.target.language)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Choice card ───────────────────────────────────────────────────────── */

export function ChoiceCard({
  projectId,
  question,
  postResult,
}: {
  projectId: string;
  question: ChoiceQuestion;
  postResult: PostResultFn;
}) {
  const { t } = useTranslation("openhands");
  const answerQuestion = useModernizationStudioStore((s) => s.answerQuestion);
  const [selected, setSelected] = React.useState<string[]>(question.selected);
  const [other, setOther] = React.useState(question.other ?? "");
  const answered = question.status === "answered";
  const OTHER = "__other__";

  const toggle = (id: string) => {
    if (answered) return;
    if (question.kind === "single") {
      setSelected([id]);
      return;
    }
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const confirm = () => {
    const picked = selected.filter((id) => id !== OTHER);
    const otherText = selected.includes(OTHER) ? other.trim() : undefined;
    if (picked.length === 0 && !otherText) return;
    const saved = answerQuestion(projectId, question.id, picked, otherText);
    if (!saved) return;
    postResult(
      receipt({
        status: "answered",
        question_id: question.id,
        selected: picked,
        selected_labels: picked.map(
          (id) => question.options.find((o) => o.id === id)?.label ?? id,
        ),
        other: otherText,
        component_id: question.componentId,
      }),
    );
  };

  const canConfirm =
    selected.some((id) => id !== OTHER) ||
    (selected.includes(OTHER) && other.trim().length > 0);

  return (
    <section
      data-testid={`neome-question-${question.id}`}
      data-status={question.status}
      className={cn(
        "ame-card flex flex-col gap-3 p-4",
        !answered && "ring-1 ring-[var(--primary-500)]/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="ame-eyebrow">
            {t(I18nKey.NEOME$QUESTIONS_TITLE)}
          </span>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {question.title}
          </h3>
          {question.prompt ? (
            <p className="text-sm text-[var(--text-secondary)]">
              {question.prompt}
            </p>
          ) : null}
        </div>
        {answered ? (
          <span className="ame-badge ame-badge-success shrink-0">
            <Check size={12} aria-hidden /> {t(I18nKey.NEOME$CHOICE_ANSWERED)}
          </span>
        ) : null}
      </div>
      <div
        role={question.kind === "single" ? "radiogroup" : "group"}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {question.options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              role={question.kind === "single" ? "radio" : "checkbox"}
              aria-checked={active}
              disabled={answered}
              data-testid={`neome-option-${question.id}-${option.id}`}
              onClick={() => toggle(option.id)}
              className={cn(
                "ame-card-interactive flex items-center gap-3 rounded-[var(--radius-sm)] border p-3 text-left transition-colors",
                active
                  ? "border-[var(--primary-500)] bg-[var(--primary-bg-subtle)]"
                  : "border-[var(--border-color)]",
                answered && !active && "opacity-50",
              )}
            >
              <TechLogo id={option.logo ?? option.label} size={26} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                  {option.label}
                  {option.recommended ? (
                    <span className="ame-badge ame-badge-primary">
                      {t(I18nKey.NEOME$CHOICE_RECOMMENDED)}
                    </span>
                  ) : null}
                </span>
                {option.description &&
                option.description.trim().toLowerCase() !==
                  option.label.trim().toLowerCase() ? (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {option.description}
                  </span>
                ) : null}
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  active
                    ? "border-[var(--primary-500)] bg-[var(--primary-500)] text-white"
                    : "border-[var(--border-color)]",
                )}
              >
                {active ? <Check size={12} /> : null}
              </span>
            </button>
          );
        })}
        {question.allowOther ? (
          <div
            className={cn(
              "flex flex-col gap-2 rounded-[var(--radius-sm)] border p-3",
              selected.includes(OTHER)
                ? "border-[var(--primary-500)]"
                : "border-[var(--border-color)]",
            )}
          >
            <button
              type="button"
              disabled={answered}
              data-testid={`neome-option-${question.id}-other`}
              onClick={() => toggle(OTHER)}
              className="text-left text-sm font-medium text-[var(--text-primary)]"
            >
              {t(I18nKey.NEOME$CHOICE_OTHER)}
            </button>
            {selected.includes(OTHER) ? (
              <input
                type="text"
                value={other}
                disabled={answered}
                onChange={(e) => setOther(e.target.value)}
                placeholder={t(I18nKey.NEOME$CHOICE_OTHER_PLACEHOLDER)}
                data-testid={`neome-other-${question.id}`}
                className="ame-input w-full rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-transparent px-2 py-1 text-sm"
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {!answered ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!canConfirm}
            data-testid={`neome-confirm-${question.id}`}
            onClick={confirm}
            className="ame-btn-primary ame-btn-sm"
          >
            {t(I18nKey.NEOME$CHOICE_CONFIRM)}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/* ── Approval card ─────────────────────────────────────────────────────── */

export function ApprovalCard({
  projectId,
  approval,
  postResult,
}: {
  projectId: string;
  approval: ApprovalRequest;
  postResult: PostResultFn;
}) {
  const { t } = useTranslation("openhands");
  const resolveApproval = useModernizationStudioStore((s) => s.resolveApproval);
  const [comment, setComment] = React.useState("");
  const pending = approval.status === "pending";

  const decide = (status: "approved" | "changes") => {
    const saved = resolveApproval(
      projectId,
      approval.id,
      status,
      comment.trim() || undefined,
    );
    if (!saved) return;
    postResult(
      receipt({
        status,
        approval_id: approval.id,
        comment: comment.trim() || undefined,
      }),
    );
  };

  return (
    <section
      data-testid={`neome-approval-${approval.id}`}
      data-status={approval.status}
      className={cn(
        "ame-card flex flex-col gap-3 p-4",
        pending && "ring-1 ring-[var(--warning-500,#d97706)]/50",
      )}
    >
      <span className="ame-eyebrow flex items-center gap-1">
        <ShieldAlert size={12} aria-hidden /> {t(I18nKey.NEOME$APPROVAL_TITLE)}
      </span>
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {approval.what}
      </p>
      {approval.why ? (
        <p className="text-sm text-[var(--text-secondary)]">{approval.why}</p>
      ) : null}
      {pending ? (
        <>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t(I18nKey.NEOME$APPROVAL_COMMENT)}
            data-testid={`neome-approval-comment-${approval.id}`}
            className="ame-input w-full rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-transparent px-2 py-1 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              data-testid={`neome-approval-changes-${approval.id}`}
              onClick={() => decide("changes")}
              className="ame-btn-secondary ame-btn-sm"
            >
              {t(I18nKey.NEOME$REQUEST_CHANGES)}
            </button>
            <button
              type="button"
              data-testid={`neome-approval-approve-${approval.id}`}
              onClick={() => decide("approved")}
              className="ame-btn-primary ame-btn-sm"
            >
              {t(I18nKey.NEOME$APPROVE)}
            </button>
          </div>
        </>
      ) : (
        <span
          className={cn(
            "ame-badge w-fit",
            approval.status === "approved"
              ? "ame-badge-success"
              : "ame-badge-neutral",
          )}
        >
          {approval.status === "approved"
            ? t(I18nKey.NEOME$APPROVE)
            : t(I18nKey.NEOME$REQUEST_CHANGES)}
          {approval.comment ? ` · ${approval.comment}` : ""}
        </span>
      )}
    </section>
  );
}

/* ── Plan card ─────────────────────────────────────────────────────────── */

function StepIcon({ status }: { status: PlanStep["status"] }) {
  const cls = "h-4 w-4 shrink-0";
  switch (status) {
    case "done":
      return (
        <CheckCircle2
          className={cn(cls, "text-[var(--success-500,#16a34a)]")}
          aria-hidden
        />
      );
    case "active":
      return (
        <Loader2
          className={cn(cls, "animate-spin text-[var(--primary-500)]")}
          aria-hidden
        />
      );
    case "failed":
      return (
        <XCircle
          className={cn(cls, "text-[var(--danger-500,#dc2626)]")}
          aria-hidden
        />
      );
    case "skipped":
      return (
        <MinusCircle
          className={cn(cls, "text-[var(--text-tertiary)]")}
          aria-hidden
        />
      );
    default:
      return (
        <Circle
          className={cn(cls, "text-[var(--text-tertiary)]")}
          aria-hidden
        />
      );
  }
}

export function PlanCard({
  project,
  onStart,
  onPause,
  onResume,
  busy,
}: {
  project: ModernizationProject;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation("openhands");
  const byPhase = React.useMemo(() => {
    const map = new Map<MigrationPhase, PlanStep[]>();
    for (const phase of MIGRATION_PHASES) map.set(phase, []);
    for (const step of project.plan) map.get(step.phase)?.push(step);
    return [...map.entries()].filter(([, steps]) => steps.length > 0);
  }, [project.plan]);

  const running =
    project.status === "migrating" || project.status === "verifying";
  const canStart =
    project.status === "planned" ||
    project.status === "interviewing" ||
    project.status === "discovering";

  return (
    <section
      data-testid="neome-plan"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ame-eyebrow">{t(I18nKey.NEOME$PLAN_TITLE)}</span>
        <div className="flex gap-2">
          {canStart ? (
            <button
              type="button"
              data-testid="neome-start-migration"
              disabled={busy}
              onClick={onStart}
              className="ame-btn-primary ame-btn-sm"
            >
              {project.plan.length
                ? t(I18nKey.NEOME$START_MIGRATION)
                : t(I18nKey.NEOME$START_MIGRATION_NOW)}
            </button>
          ) : null}
          {running ? (
            <button
              type="button"
              data-testid="neome-pause"
              disabled={busy}
              onClick={onPause}
              className="ame-btn-secondary ame-btn-sm"
            >
              {t(I18nKey.NEOME$PAUSE)}
            </button>
          ) : null}
          {project.status === "paused" || project.status === "failed" ? (
            <button
              type="button"
              data-testid="neome-resume"
              disabled={busy}
              onClick={onResume}
              className="ame-btn-primary ame-btn-sm"
            >
              {t(I18nKey.NEOME$RESUME)}
            </button>
          ) : null}
        </div>
      </div>
      {project.plan.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">
          {t(I18nKey.NEOME$PLAN_EMPTY)}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {byPhase.map(([phase, steps]) => (
            <li key={phase} className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                {t(PHASE_LABEL_KEY[phase])}
              </span>
              <ul className="flex flex-col gap-1">
                {steps.map((step) => (
                  <li
                    key={step.id}
                    data-testid={`neome-step-${step.id}`}
                    data-status={step.status}
                    className={cn(
                      "flex items-start gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-sm",
                      step.id === project.currentStepId &&
                        "bg-[var(--primary-bg-subtle)]",
                    )}
                  >
                    <StepIcon status={step.status} />
                    <span className="flex min-w-0 flex-col">
                      <span
                        className={cn(
                          "text-[var(--text-primary)]",
                          step.status === "done" && "line-through opacity-70",
                        )}
                      >
                        {step.title}
                      </span>
                      {step.note ? (
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {step.note}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ── Report card ───────────────────────────────────────────────────────── */

export function ReportCard({ report }: { report: MigrationReport }) {
  const { t } = useTranslation("openhands");
  return (
    <section
      data-testid="neome-report"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <span className="ame-eyebrow flex items-center gap-1">
        <FileText size={12} aria-hidden /> {t(I18nKey.NEOME$REPORT_TITLE)}
      </span>
      <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
        {report.summary}
      </p>
      {report.verification ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {Object.entries(report.verification).map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-[var(--text-tertiary)]">{k}</dt>
              <dd className="text-[var(--text-primary)]">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
      {report.artifacts.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[var(--text-tertiary)]">
            {t(I18nKey.NEOME$REPORT_ARTIFACTS)}
          </span>
          <ul className="flex flex-wrap gap-1">
            {report.artifacts.map((a) => (
              <li key={a} className="ame-badge ame-badge-neutral font-mono">
                {a}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export const PendingDot = CircleDashed;
