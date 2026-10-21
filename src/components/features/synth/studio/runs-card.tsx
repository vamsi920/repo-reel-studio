import React from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FolderOpen,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { getCachedRun, type SynthRun } from "#/stores/synth-studio-store";
import { runIsVerified } from "#/services/synth-control";
import { FORMAT_LABELS } from "#/lib/synth/exporters";
import type { Row } from "#/lib/synth/model";
import { downloadBundle, downloadFile, formatBytes } from "./download";

/**
 * Every generation run: what was generated, whether it passed validation,
 * where it was written, a preview of the rows, downloads, and whether it
 * was proven usable (loaded / tested).
 */

function cell(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.length > 40 ? `${text.slice(0, 38)}…` : text;
}

export function PreviewTable({
  rows,
  edgeFrom,
}: {
  rows: Row[];
  edgeFrom?: number;
}) {
  const { t } = useTranslation("openhands");
  if (rows.length === 0) {
    return (
      <p className="text-xs text-[var(--text-tertiary)]">
        {t(I18nKey.SYNTH$PREVIEW_EMPTY)}
      </p>
    );
  }
  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border-color)]">
      <table
        data-testid="synth-preview-table"
        className="w-full text-left font-mono text-[11px]"
      >
        <thead className="bg-[var(--background-secondary)] text-[var(--text-tertiary)]">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-2 py-1 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={cn(
                "border-t border-[var(--border-color)]",
                edgeFrom !== undefined &&
                  i >= edgeFrom &&
                  "bg-[var(--primary-bg-subtle)]",
              )}
            >
              {columns.map((c) => (
                <td
                  key={c}
                  className="max-w-[24ch] truncate whitespace-nowrap px-2 py-1 text-[var(--text-secondary)]"
                  title={String(row[c] ?? "")}
                >
                  {cell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunBlock({
  run,
  initiallyOpen,
}: {
  run: SynthRun;
  initiallyOpen: boolean;
}) {
  const { t } = useTranslation("openhands");
  const [open, setOpen] = React.useState(initiallyOpen);
  const entities = Object.keys(run.preview);
  const [entity, setEntity] = React.useState(entities[0] ?? "");
  const cached = getCachedRun(run.id);
  const verified = runIsVerified(run);
  const { validation } = run;

  return (
    <li
      data-testid={`synth-run-${run.id}`}
      data-valid={validation.ok}
      data-verified={verified}
      className="rounded-[var(--radius-sm)] border border-[var(--border-color)]"
    >
      <button
        type="button"
        aria-expanded={open}
        data-testid={`synth-run-toggle-${run.id}`}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 p-2.5 text-left"
      >
        {open ? (
          <ChevronDown size={14} aria-hidden />
        ) : (
          <ChevronRight size={14} aria-hidden />
        )}
        {validation.ok ? (
          <CheckCircle2
            size={16}
            aria-hidden
            className="shrink-0 text-[var(--success-500,#16a34a)]"
          />
        ) : (
          <XCircle
            size={16}
            aria-hidden
            className="shrink-0 text-[var(--danger-500,#dc2626)]"
          />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-[var(--text-primary)]">
            {run.scenarioName} ·{" "}
            {t(I18nKey.SYNTH$ROWS_COUNT, { count: run.rowsTotal })}
          </span>
          <span className="truncate text-[11px] text-[var(--text-tertiary)]">
            {t(I18nKey.SYNTH$SEED)} {run.seed} ·{" "}
            {t(I18nKey.SYNTH$CHECKS, {
              passed: validation.checksPassed,
              total: validation.checksTotal,
            })}
            {" · "}
            {new Date(run.finishedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" · "}
            {run.triggeredBy === "agent"
              ? t(I18nKey.SYNTH$BY_AGENT)
              : t(I18nKey.SYNTH$BY_YOU)}
          </span>
        </span>
        {verified ? (
          <span className="ame-badge ame-badge-success shrink-0">
            <ShieldCheck size={11} aria-hidden /> {t(I18nKey.SYNTH$VERIFIED)}
          </span>
        ) : validation.ok ? (
          <span className="ame-badge ame-badge-neutral shrink-0">
            {t(I18nKey.SYNTH$VALID)}
          </span>
        ) : (
          <span className="ame-badge ame-badge-danger shrink-0">
            {t(I18nKey.SYNTH$INVALID)}
          </span>
        )}
      </button>

      {open ? (
        <div className="flex flex-col gap-3 border-t border-[var(--border-color)] p-2.5">
          {!validation.ok ? (
            <div
              data-testid={`synth-run-failures-${run.id}`}
              className="ame-alert ame-alert-danger text-xs"
            >
              <p className="font-medium">
                {t(I18nKey.SYNTH$FAILED_CHECKS, {
                  count: validation.checksTotal - validation.checksPassed,
                })}
              </p>
              <ul className="list-disc pl-4">
                {validation.failed.slice(0, 6).map((f) => (
                  <li key={f.id}>
                    {f.label} · {f.failures}
                    {f.samples[0] ? ` (${f.samples[0]})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {run.warnings.length ? (
            <ul className="list-disc pl-4 text-[11px] text-[var(--warning-600,#b45309)]">
              {run.warnings.slice(0, 4).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
            {run.workspaceDir ? (
              <span
                data-testid={`synth-run-dir-${run.id}`}
                className="inline-flex items-center gap-1 font-mono"
              >
                <FolderOpen size={12} aria-hidden /> {run.workspaceDir}/
              </span>
            ) : run.writeError ? (
              <span className="text-[var(--warning-600,#b45309)]">
                {t(I18nKey.SYNTH$NOT_WRITTEN)}: {run.writeError}
              </span>
            ) : (
              <span className="text-[var(--text-tertiary)]">
                {t(I18nKey.SYNTH$NOT_WRITTEN_NO_RUNTIME)}
              </span>
            )}
            <span>{run.formats.map((f) => FORMAT_LABELS[f]).join(", ")}</span>
          </div>

          {run.verification ? (
            <p
              data-testid={`synth-run-verification-${run.id}`}
              className="text-xs text-[var(--text-secondary)]"
            >
              <ShieldCheck size={12} aria-hidden className="mr-1 inline" />
              {run.verification.loadedInto
                ? `${run.verification.loadedInto} · `
                : ""}
              {run.verification.rowsLoaded
                ? `${t(I18nKey.SYNTH$ROWS_LOADED, { count: run.verification.rowsLoaded })} · `
                : ""}
              {run.verification.testsTotal
                ? t(I18nKey.SYNTH$TESTS_RESULT, {
                    passing: run.verification.testsPassing ?? 0,
                    total: run.verification.testsTotal,
                  })
                : ""}
              {run.verification.notes ? ` · ${run.verification.notes}` : ""}
            </p>
          ) : null}

          {entities.length ? (
            <div className="flex flex-col gap-2">
              <div role="tablist" className="flex flex-wrap gap-1">
                {entities.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={entity === id}
                    data-testid={`synth-preview-tab-${run.id}-${id}`}
                    onClick={() => setEntity(id)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px]",
                      entity === id
                        ? "border-[var(--primary-500)] text-[var(--text-primary)]"
                        : "border-[var(--border-color)] text-[var(--text-tertiary)]",
                    )}
                  >
                    {id} · {run.rowsPerEntity[id] ?? 0}
                  </button>
                ))}
              </div>
              <PreviewTable rows={run.preview[entity] ?? []} />
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {t(I18nKey.SYNTH$PREVIEW_HINT, {
                  shown: (run.preview[entity] ?? []).length,
                  total: run.rowsPerEntity[entity] ?? 0,
                })}
              </span>
            </div>
          ) : null}

          {cached ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid={`synth-download-all-${run.id}`}
                onClick={() =>
                  downloadBundle(
                    cached.files,
                    `synth-${run.scenarioId}-${run.seed}`,
                  )
                }
                className="ame-btn-secondary ame-btn-xs"
              >
                <Download size={12} aria-hidden />{" "}
                {t(I18nKey.SYNTH$DOWNLOAD_ALL)}
              </button>
              {cached.files
                .filter(
                  (f) =>
                    !f.path.startsWith("data/") || cached.files.length <= 8,
                )
                .slice(0, 12)
                .map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    data-testid={`synth-download-${run.id}-${file.path}`}
                    onClick={() => downloadFile(file, `synth-${run.seed}-`)}
                    className="ame-badge ame-badge-neutral cursor-pointer"
                    title={formatBytes(file.content.length)}
                  >
                    {file.path}
                  </button>
                ))}
            </div>
          ) : (
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {t(I18nKey.SYNTH$DOWNLOAD_GONE)}
            </span>
          )}
        </div>
      ) : null}
    </li>
  );
}

export function RunsCard({ runs }: { runs: SynthRun[] }) {
  const { t } = useTranslation("openhands");
  const ordered = [...runs].reverse();
  return (
    <section
      data-testid="synth-runs"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between">
        <span className="ame-eyebrow">{t(I18nKey.SYNTH$RUNS_TITLE)}</span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {runs.length}
        </span>
      </div>
      {ordered.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">
          {t(I18nKey.SYNTH$RUNS_EMPTY)}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ordered.map((run, i) => (
            <RunBlock key={run.id} run={run} initiallyOpen={i === 0} />
          ))}
        </ul>
      )}
    </section>
  );
}
