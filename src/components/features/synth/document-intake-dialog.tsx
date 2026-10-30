import React from "react";
import { useTranslation } from "react-i18next";
import { FileText, ShieldCheck, Trash2, Upload } from "lucide-react";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  DOCUMENT_EXTENSIONS,
  MAX_DOCUMENT_BYTES,
  documentFormatOf,
  extractFromDocument,
  readDocument,
} from "#/lib/synth/documents";

/** One document picked (or pasted) in the dialog, with a preview of what it holds. */
export interface PickedDocument {
  key: string;
  name: string;
  bytes: Uint8Array;
  preview: {
    entities: number;
    fields: number;
    rules: number;
    requirements: number;
    personalValuesRemoved: number;
    unreadable: boolean;
    error?: string;
  };
}

const PASTED_FILE_NAME = "pasted-requirements.md";

export function previewDocument(
  name: string,
  bytes: Uint8Array,
): PickedDocument["preview"] {
  const read = readDocument(name, bytes);
  if (!read.text && !(read.unreadable && read.format === "pdf")) {
    return {
      entities: 0,
      fields: 0,
      rules: 0,
      requirements: 0,
      personalValuesRemoved: 0,
      unreadable: true,
      error: read.warnings[0],
    };
  }
  const extraction = extractFromDocument(read.text, { docName: name });
  return {
    entities: extraction.entities.length,
    fields: extraction.entities.reduce((n, e) => n + e.fields.length, 0),
    rules: extraction.rules.length,
    requirements: extraction.requirements.length,
    personalValuesRemoved: extraction.personalValuesRemoved,
    unreadable: read.unreadable,
  };
}

/** Name for a project from its first document ("BRD - Loans v2.docx" → "BRD - Loans v2"). */
function nameFromFile(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_]+/g, " ")
    .trim()
    .slice(0, 80);
}

export function DocumentIntakeDialog({
  isOpen,
  onClose,
  onConfirm,
  busy = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, documents: PickedDocument[]) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation("openhands");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = React.useState<PickedDocument[]>([]);
  const [pasted, setPasted] = React.useState("");
  const [name, setName] = React.useState("");
  const [errors, setErrors] = React.useState<string[]>([]);
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setDocuments([]);
      setPasted("");
      setName("");
      setErrors([]);
    }
  }, [isOpen]);

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const next: PickedDocument[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      if (!documentFormatOf(file.name)) {
        problems.push(t(I18nKey.SYNTH$DOC_UNSUPPORTED, { name: file.name }));
        continue;
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        problems.push(t(I18nKey.SYNTH$DOC_TOO_LARGE, { name: file.name }));
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      next.push({
        key: `${file.name}:${file.size}:${file.lastModified}`,
        name: file.name,
        bytes,
        preview: previewDocument(file.name, bytes),
      });
    }
    setErrors(problems);
    setDocuments((prev) => {
      const merged = [
        ...prev.filter((p) => !next.some((n) => n.name === p.name)),
        ...next,
      ];
      return merged.slice(0, 10);
    });
    if (!name && next[0]) setName(nameFromFile(next[0].name));
  };

  const pastedDocument = React.useMemo<PickedDocument | null>(() => {
    const text = pasted.trim();
    if (!text) return null;
    const bytes = new TextEncoder().encode(text);
    return {
      key: "pasted",
      name: PASTED_FILE_NAME,
      bytes,
      preview: previewDocument(PASTED_FILE_NAME, bytes),
    };
  }, [pasted]);

  const all = [...documents, ...(pastedDocument ? [pastedDocument] : [])];
  const usable = all.filter((d) => !d.preview.error);
  const totals = usable.reduce(
    (acc, d) => ({
      entities: acc.entities + d.preview.entities,
      fields: acc.fields + d.preview.fields,
      rules: acc.rules + d.preview.rules,
      requirements: acc.requirements + d.preview.requirements,
      removed: acc.removed + d.preview.personalValuesRemoved,
    }),
    { entities: 0, fields: 0, rules: 0, requirements: 0, removed: 0 },
  );

  if (!isOpen) return null;

  const projectName =
    name.trim() ||
    (usable[0]
      ? nameFromFile(usable[0].name)
      : t(I18nKey.SYNTH$DOC_PASTED_NAME));

  return (
    <ModalBackdrop onClose={busy ? () => {} : onClose}>
      <ModalBody
        width="lg"
        className="relative items-start border border-[var(--oh-border)] !gap-4"
      >
        <ModalCloseButton
          onClose={onClose}
          testId="synth-document-dialog-close"
        />
        <div className="flex w-full flex-col gap-1 pr-6">
          <BaseModalTitle title={t(I18nKey.SYNTH$DOC_DIALOG_TITLE)} />
          <p className="text-sm text-[var(--text-secondary)]">
            {t(I18nKey.SYNTH$DOC_DIALOG_BODY)}
          </p>
        </div>

        <div
          data-testid="synth-document-drop"
          data-dragging={dragging}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-5 text-center",
            dragging
              ? "border-[var(--primary-500)] bg-[var(--primary-bg-subtle)]"
              : "border-[var(--border-color)]",
          )}
        >
          <Upload size={18} aria-hidden className="text-[var(--primary-500)]" />
          <button
            type="button"
            data-testid="synth-document-choose"
            onClick={() => fileRef.current?.click()}
            className="ame-btn-secondary ame-btn-sm"
          >
            {t(I18nKey.SYNTH$DOC_DROP)}
          </button>
          <span className="text-xs text-[var(--text-tertiary)]">
            {t(I18nKey.SYNTH$DOC_FORMATS)}
          </span>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={DOCUMENT_EXTENSIONS.join(",")}
            className="hidden"
            data-testid="synth-document-input"
            onChange={(e) => {
              void addFiles(e.target.files);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
        </div>

        {errors.length ? (
          <ul
            data-testid="synth-document-errors"
            className="ame-alert ame-alert-warning w-full text-xs"
          >
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}

        {documents.length ? (
          <ul
            data-testid="synth-document-list"
            className="flex w-full flex-col gap-1.5"
          >
            {documents.map((doc) => (
              <li
                key={doc.key}
                data-testid="synth-document-item"
                className="flex items-start justify-between gap-2 rounded-md border border-[var(--border-color)] px-3 py-2"
              >
                <span className="flex min-w-0 items-start gap-2">
                  <FileText
                    size={14}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-[var(--text-tertiary)]"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-[var(--text-primary)]">
                      {doc.name}
                    </span>
                    <DocumentPreviewLine preview={doc.preview} />
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={t(I18nKey.SYNTH$DOC_REMOVE)}
                  onClick={() =>
                    setDocuments((prev) =>
                      prev.filter((p) => p.key !== doc.key),
                    )
                  }
                  className="ame-btn-icon ame-btn-icon-sm shrink-0"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <label className="flex w-full flex-col gap-1 text-xs text-[var(--text-secondary)]">
          {t(I18nKey.SYNTH$DOC_PASTE)}
          <textarea
            data-testid="synth-document-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={5}
            placeholder={t(I18nKey.SYNTH$DOC_PASTE_PLACEHOLDER)}
            className="ame-input w-full resize-y font-mono text-xs"
          />
          {pastedDocument ? (
            <DocumentPreviewLine preview={pastedDocument.preview} />
          ) : null}
        </label>

        <label className="flex w-full flex-col gap-1 text-xs text-[var(--text-secondary)]">
          {t(I18nKey.SYNTH$DOC_NAME_LABEL)}
          <input
            data-testid="synth-document-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={projectName}
            className="ame-input w-full text-sm"
          />
        </label>

        {usable.length ? (
          <div
            data-testid="synth-document-totals"
            className="flex w-full flex-col gap-1 text-xs text-[var(--text-secondary)]"
          >
            <span>
              {t(I18nKey.SYNTH$DOC_FOUND, {
                entities: totals.entities,
                fields: totals.fields,
                rules: totals.rules,
                requirements: totals.requirements,
              })}
            </span>
            {totals.removed ? (
              <span className="flex items-center gap-1 text-[var(--success-600,#15803d)]">
                <ShieldCheck size={12} aria-hidden />
                {t(I18nKey.SYNTH$DOC_PII_REMOVED, { count: totals.removed })}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex w-full justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="ame-btn-secondary ame-btn-sm"
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </button>
          <button
            type="button"
            data-testid="synth-document-start"
            disabled={busy || usable.length === 0}
            onClick={() => onConfirm(projectName, usable)}
            className="ame-btn-primary ame-btn-sm"
          >
            {busy ? t(I18nKey.SYNTH$STARTING) : t(I18nKey.SYNTH$DOC_START)}
          </button>
        </div>
      </ModalBody>
    </ModalBackdrop>
  );
}

function DocumentPreviewLine({
  preview,
}: {
  preview: PickedDocument["preview"];
}) {
  const { t } = useTranslation("openhands");
  if (preview.error) {
    return (
      <span className="text-xs text-[var(--danger-600,#dc2626)]">
        {preview.error}
      </span>
    );
  }
  if (preview.unreadable) {
    return (
      <span className="text-xs text-[var(--warning-700,#b45309)]">
        {t(I18nKey.SYNTH$DOC_UNREADABLE)}
      </span>
    );
  }
  return (
    <span
      data-testid="synth-document-preview"
      className="text-xs text-[var(--text-tertiary)]"
    >
      {preview.entities
        ? t(I18nKey.SYNTH$DOC_FOUND, {
            entities: preview.entities,
            fields: preview.fields,
            rules: preview.rules,
            requirements: preview.requirements,
          })
        : t(I18nKey.SYNTH$DOC_NOTHING_FOUND)}
    </span>
  );
}
