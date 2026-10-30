import React from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  CircleDashed,
  FileText,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { SynthProject } from "#/stores/synth-studio-store";
import { receipt, type PostResultFn } from "#/services/synth-control";
import {
  documentText,
  ingestDocument,
  projectCoverage,
} from "#/services/synth-documents";
import {
  DOCUMENT_EXTENSIONS,
  MAX_DOCUMENT_BYTES,
  documentFormatOf,
} from "#/lib/synth/documents";
import type { RunInWorkspace } from "#/lib/modernization/replay-harness";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

const COLLAPSED_ROWS = 6;
/** Requirement ids the extractor made up for untagged sentences. */
const GENERATED_ID = /(^|:)DOC-\d+$/;

/**
 * Requirement documents behind the model and how much of what they ask
 * for the model already shows. On a code project it is a small prompt to
 * add a BRD; on a document project it is the source of truth.
 */
export function DocumentsCard({
  project,
  postResult,
  runInWorkspace,
}: {
  project: SynthProject;
  postResult: PostResultFn;
  runInWorkspace?: RunInWorkspace;
}) {
  const { t } = useTranslation("openhands");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [adding, setAdding] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const documents = project.documents ?? [];
  const coverage = React.useMemo(() => projectCoverage(project), [project]);
  const dataRequirements = (project.requirements ?? []).filter(
    (r) => r.kind === "data",
  );
  const uncoveredIds = new Set(coverage.uncovered.map((r) => r.id));
  const ordered = [...dataRequirements].sort(
    (a, b) => Number(uncoveredIds.has(b.id)) - Number(uncoveredIds.has(a.id)),
  );
  const visible = showAll
    ? ordered
    : ordered.filter((r) => uncoveredIds.has(r.id)).slice(0, COLLAPSED_ROWS);
  const percent = coverage.data
    ? Math.round((coverage.covered / coverage.data) * 100)
    : 0;

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setAdding(true);
    try {
      for (const file of Array.from(files)) {
        if (!documentFormatOf(file.name)) {
          displayErrorToast(
            t(I18nKey.SYNTH$DOC_UNSUPPORTED, { name: file.name }),
          );
          continue;
        }
        if (file.size > MAX_DOCUMENT_BYTES) {
          displayErrorToast(
            t(I18nKey.SYNTH$DOC_TOO_LARGE, { name: file.name }),
          );
          continue;
        }
        const outcome = await ingestDocument(
          project.id,
          { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
          { addedBy: "user", runInWorkspace },
        );
        if (!outcome.ok || !outcome.document) {
          displayErrorToast(outcome.reason ?? t(I18nKey.SYNTH$ACTION_ERROR));
          continue;
        }
        postResult(
          receipt({
            status: "document_added_by_user",
            document_id: outcome.document.id,
            name: outcome.document.name,
            path: outcome.document.workspacePath,
            original_path: outcome.document.originalPath || undefined,
            entities: outcome.extraction?.entities.map((e) => e.id),
            rules: outcome.extraction?.rules.length,
            requirements: outcome.extraction?.requirements.length,
            guidance:
              "The user added a requirements document; its extracted entities and rules are already merged into the model. Call describe, read the document in full, and model what requirements.uncovered still lists, citing requirement ids in evidence.",
          }),
        );
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <section
      data-testid="synth-documents"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ame-eyebrow flex items-center gap-1">
          <FileText size={12} aria-hidden /> {t(I18nKey.SYNTH$DOCS_TITLE)}
        </span>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={DOCUMENT_EXTENSIONS.join(",")}
          className="hidden"
          data-testid="synth-documents-input"
          onChange={(e) => {
            void onFiles(e.target.files);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <button
          type="button"
          data-testid="synth-documents-add"
          disabled={adding}
          onClick={() => fileRef.current?.click()}
          className="ame-btn-secondary ame-btn-xs"
        >
          <Upload size={12} aria-hidden />{" "}
          {adding ? t(I18nKey.SYNTH$DOC_READING) : t(I18nKey.SYNTH$DOCS_ADD)}
        </button>
      </div>

      {documents.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">
          {t(I18nKey.SYNTH$DOCS_EMPTY)}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {documents.map((doc) => {
            const lost = !doc.workspacePath && !documentText(doc.id);
            return (
              <li
                key={doc.id}
                data-testid={`synth-document-${doc.id}`}
                className="flex flex-col gap-0.5 rounded-md border border-[var(--border-color)] px-3 py-2"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-[var(--text-primary)]">
                    {doc.name}
                  </span>
                  <span
                    data-testid="synth-document-state"
                    data-state={
                      doc.workspacePath ? "sent" : lost ? "lost" : "pending"
                    }
                    className={cn(
                      "ame-badge shrink-0",
                      doc.workspacePath
                        ? "ame-badge-success"
                        : lost
                          ? "ame-badge-warning"
                          : "ame-badge-neutral",
                    )}
                  >
                    {doc.workspacePath
                      ? t(I18nKey.SYNTH$DOCS_SENT)
                      : lost
                        ? t(I18nKey.SYNTH$DOCS_LOST)
                        : t(I18nKey.SYNTH$DOCS_NOT_SENT)}
                  </span>
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {doc.unreadable
                    ? t(I18nKey.SYNTH$DOC_UNREADABLE)
                    : t(I18nKey.SYNTH$DOCS_SUMMARY, {
                        entities: doc.entities.length,
                        fields: doc.fields,
                        rules: doc.rules,
                      })}
                </span>
                {doc.personalValuesRemoved ? (
                  <span className="flex items-center gap-1 text-xs text-[var(--success-600,#15803d)]">
                    <ShieldCheck size={11} aria-hidden />
                    {t(I18nKey.SYNTH$DOC_PII_REMOVED, {
                      count: doc.personalValuesRemoved,
                    })}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {documents.length ? (
        <div data-testid="synth-coverage" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-[var(--text-primary)]">
              {t(I18nKey.SYNTH$COVERAGE_TITLE)}
            </span>
            <span
              data-testid="synth-coverage-count"
              className="text-[var(--text-secondary)]"
            >
              {coverage.data
                ? t(I18nKey.SYNTH$COVERAGE_BODY, {
                    covered: coverage.covered,
                    data: coverage.data,
                  })
                : t(I18nKey.SYNTH$COVERAGE_NONE)}
            </span>
          </div>
          {coverage.data ? (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={t(I18nKey.SYNTH$COVERAGE_TITLE)}
              className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary,#e5e7eb)]"
            >
              <div
                className="h-full rounded-full bg-[var(--primary-500)] transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
          {visible.length ? (
            <ul
              data-testid="synth-coverage-list"
              className="flex flex-col gap-1"
            >
              {visible.map((r) => {
                const gap = uncoveredIds.has(r.id);
                return (
                  <li
                    key={`${r.docId}:${r.id}`}
                    data-testid="synth-requirement"
                    data-covered={!gap}
                    className="flex items-start gap-2 text-xs"
                  >
                    {gap ? (
                      <CircleDashed
                        size={12}
                        aria-label={t(I18nKey.SYNTH$COVERAGE_GAP)}
                        className="mt-0.5 shrink-0 text-[var(--warning-600,#d97706)]"
                      />
                    ) : (
                      <Check
                        size={12}
                        aria-label={t(I18nKey.SYNTH$COVERAGE_COVERED)}
                        className="mt-0.5 shrink-0 text-[var(--success-500,#16a34a)]"
                      />
                    )}
                    <span className="min-w-0">
                      {/* Ids the document gave (BR-12) are shown; generated ones are not. */}
                      {GENERATED_ID.test(r.id) ? null : (
                        <>
                          <span className="font-mono text-[var(--text-tertiary)]">
                            {r.id}
                          </span>{" "}
                        </>
                      )}
                      <span className="text-[var(--text-secondary)]">
                        {r.text}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {ordered.length > visible.length || showAll ? (
            <button
              type="button"
              data-testid="synth-coverage-toggle"
              onClick={() => setShowAll((v) => !v)}
              className="self-start text-xs text-[var(--primary-600)] hover:underline"
            >
              {showAll
                ? t(I18nKey.SYNTH$COVERAGE_SHOW_GAPS)
                : t(I18nKey.SYNTH$COVERAGE_SHOW_ALL, { count: ordered.length })}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
