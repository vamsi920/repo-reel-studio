import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { Row } from "#/lib/synth/model";

/**
 * Full-screen view of a run's data: every table, paged, with a sticky
 * header and wide cells, so a dataset can be read without scrolling a
 * narrow side panel. Rows come from the tab's cached dataset when it is
 * there, otherwise from the stored preview.
 */

export const DATA_VIEW_PAGE_SIZE = 50;

/**
 * Renders `children` at the top of the app's style scope. A `fixed`
 * overlay inside the workbench would be positioned against the animated
 * (transformed) card around it, and a portal to <body> would leave the
 * `[data-agent-server-ui]`-scoped styles behind.
 */
function ScopePortal({ children }: { children: React.ReactNode }) {
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const [target, setTarget] = React.useState<Element | null>(null);
  React.useEffect(() => {
    setTarget(
      anchorRef.current?.closest("[data-agent-server-ui]") ??
        (typeof document !== "undefined" ? document.body : null),
    );
  }, []);
  return (
    <>
      <span ref={anchorRef} hidden />
      {target ? createPortal(children, target) : null}
    </>
  );
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function DataViewer({
  title,
  tables,
  totals,
  previewOnly,
  initialEntity,
  onClose,
}: {
  title: string;
  /** Rows per entity id. */
  tables: Record<string, Row[]>;
  /** Real row counts per entity (larger than `tables` in preview mode). */
  totals: Record<string, number>;
  previewOnly: boolean;
  initialEntity?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("openhands");
  const entities = Object.keys(tables);
  const [entity, setEntity] = React.useState(
    initialEntity && tables[initialEntity]
      ? initialEntity
      : (entities[0] ?? ""),
  );
  const [page, setPage] = React.useState(0);
  const rows = tables[entity] ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / DATA_VIEW_PAGE_SIZE));
  const shown = rows.slice(
    page * DATA_VIEW_PAGE_SIZE,
    (page + 1) * DATA_VIEW_PAGE_SIZE,
  );
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  React.useEffect(() => setPage(0), [entity]);

  return (
    <ScopePortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="synth-data-viewer"
        className="fixed inset-0 z-50 flex flex-col bg-[var(--background-primary)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-color)] px-6 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="ame-eyebrow">
              {t(I18nKey.SYNTH$DATA_VIEW_TITLE)}
            </span>
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {title}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            data-testid="synth-data-viewer-close"
            onClick={onClose}
            className="ame-btn-secondary ame-btn-sm"
          >
            <X size={14} aria-hidden /> {t(I18nKey.SYNTH$CLOSE)}
          </button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border-color)] px-6 py-2">
          <div role="tablist" className="flex flex-wrap gap-1">
            {entities.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={entity === id}
                data-testid={`synth-data-viewer-tab-${id}`}
                onClick={() => setEntity(id)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  entity === id
                    ? "border-[var(--primary-500)] text-[var(--text-primary)]"
                    : "border-[var(--border-color)] text-[var(--text-tertiary)]",
                )}
              >
                {id} · {(totals[id] ?? 0).toLocaleString()}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-[var(--text-tertiary)]">
            {t(I18nKey.SYNTH$DATA_VIEW_SUMMARY, {
              rows: (totals[entity] ?? rows.length).toLocaleString(),
              columns: columns.length,
            })}
          </span>
        </div>

        {previewOnly ? (
          <p
            data-testid="synth-data-viewer-preview-only"
            className="shrink-0 px-6 py-2 text-xs text-[var(--warning-600,#b45309)]"
          >
            {t(I18nKey.SYNTH$DATA_VIEW_PREVIEW_ONLY)}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto px-6 py-3">
          <table
            data-testid="synth-data-viewer-table"
            className="w-full border-collapse text-left font-mono text-xs"
          >
            <thead className="sticky top-0 z-10 bg-[var(--background-secondary)] text-[var(--text-tertiary)]">
              <tr>
                <th className="px-2 py-1.5 font-medium">#</th>
                {columns.map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap px-2 py-1.5 font-medium"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, i) => (
                <tr
                  key={page * DATA_VIEW_PAGE_SIZE + i}
                  className="border-t border-[var(--border-color)] align-top"
                >
                  <td className="px-2 py-1 text-[var(--text-tertiary)]">
                    {page * DATA_VIEW_PAGE_SIZE + i + 1}
                  </td>
                  {columns.map((c) => (
                    <td
                      key={c}
                      title={cell(row[c])}
                      className="max-w-[48ch] truncate px-2 py-1 text-[var(--text-secondary)]"
                    >
                      {cell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-color)] px-6 py-2">
          <span
            data-testid="synth-data-viewer-page"
            className="text-xs text-[var(--text-tertiary)]"
          >
            {t(I18nKey.SYNTH$PAGE_OF, { page: page + 1, pages })}
          </span>
          <button
            type="button"
            aria-label={t(I18nKey.SYNTH$PREV_PAGE)}
            data-testid="synth-data-viewer-prev"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="ame-btn-icon ame-btn-icon-sm"
          >
            <ChevronLeft size={14} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t(I18nKey.SYNTH$NEXT_PAGE)}
            data-testid="synth-data-viewer-next"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            className="ame-btn-icon ame-btn-icon-sm"
          >
            <ChevronRight size={14} aria-hidden />
          </button>
        </footer>
      </div>
    </ScopePortal>
  );
}
