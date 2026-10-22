import React from "react";
import { useTranslation } from "react-i18next";
import { Download, EyeOff, Upload } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import type { DataModel, Entity, Row } from "#/lib/synth/model";
import { entityForColumns, maskRows, parseTabular } from "#/lib/synth/privacy";
import { toCsv } from "#/lib/synth/exporters";
import { PreviewTable } from "./runs-card";
import { downloadFile } from "./download";

/**
 * Scrub a real export instead of generating data: the user loads a CSV or
 * JSON file for one table, and every personal column is replaced using the
 * choices in the data model (synthetic, masked, redacted). Columns the
 * model does not know are still judged by name. Everything happens in this
 * browser tab: the file is never stored, posted to the agent, or written to
 * the workspace.
 */

const PREVIEW_ROWS = 8;

interface MaskResult {
  fileName: string;
  entity: Entity;
  rows: Row[];
  replaced: number;
  perField: Record<string, number>;
  unknownColumns: string[];
}

export function MaskCard({
  model,
  seed,
}: {
  model: DataModel;
  /** Keeps replacements stable for this project across files. */
  seed: string;
}) {
  const { t } = useTranslation("openhands");
  const [entityId, setEntityId] = React.useState(model.entities[0]?.id ?? "");
  const [result, setResult] = React.useState<MaskResult | null>(null);
  const [error, setError] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const entity = model.entities.find((e) => e.id === entityId);

  const onFile = async (file: File | undefined) => {
    setError(false);
    setResult(null);
    if (!file || !entity) return;
    const parsed = parseTabular(await file.text());
    if (!parsed || parsed.rows.length === 0) {
      setError(true);
    } else {
      const { entity: shaped, unknownColumns } = entityForColumns(
        entity,
        parsed.columns,
      );
      const masked = maskRows(shaped, parsed.rows, seed);
      setResult({
        fileName: file.name.replace(/\.[^.]+$/, ""),
        entity: shaped,
        rows: masked.rows,
        replaced: masked.masked,
        perField: masked.perField,
        unknownColumns,
      });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  if (!entity) return null;

  return (
    <section
      data-testid="synth-mask"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <span className="ame-eyebrow flex items-center gap-1">
        <EyeOff size={12} aria-hidden /> {t(I18nKey.SYNTH$MASK_TITLE)}
      </span>
      <p className="text-sm text-[var(--text-secondary)]">
        {t(I18nKey.SYNTH$MASK_BODY)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          {t(I18nKey.SYNTH$MASK_TABLE)}
          <select
            value={entityId}
            data-testid="synth-mask-entity"
            onChange={(e) => {
              setEntityId(e.target.value);
              setResult(null);
            }}
            className="ame-input rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-transparent px-1 py-0.5 text-xs"
          >
            {model.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="hidden"
          data-testid="synth-mask-input"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          data-testid="synth-mask-pick"
          onClick={() => fileRef.current?.click()}
          className="ame-btn-secondary ame-btn-xs"
        >
          <Upload size={12} aria-hidden /> {t(I18nKey.SYNTH$MASK_PICK_FILE)}
        </button>
      </div>

      {error ? (
        <p
          data-testid="synth-mask-error"
          className="text-xs text-[var(--danger-500,#dc2626)]"
        >
          {t(I18nKey.SYNTH$MASK_ERROR)}
        </p>
      ) : null}

      {result ? (
        <div data-testid="synth-mask-result" className="flex flex-col gap-2">
          <p className="text-xs text-[var(--text-secondary)]">
            {t(I18nKey.SYNTH$MASK_RESULT, {
              rows: result.rows.length.toLocaleString(),
              values: result.replaced.toLocaleString(),
            })}
            {Object.keys(result.perField).length
              ? ` · ${Object.keys(result.perField).join(", ")}`
              : ""}
          </p>
          {result.unknownColumns.length ? (
            <p className="text-[11px] text-[var(--warning-600,#b45309)]">
              {t(I18nKey.SYNTH$MASK_UNKNOWN_COLUMNS, {
                count: result.unknownColumns.length,
                names: result.unknownColumns.slice(0, 6).join(", "),
              })}
            </p>
          ) : null}
          <PreviewTable rows={result.rows.slice(0, PREVIEW_ROWS)} />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="synth-mask-download-csv"
              onClick={() =>
                downloadFile({
                  path: `${result.fileName}.masked.csv`,
                  content: toCsv(result.entity, result.rows),
                  mimeType: "text/csv",
                })
              }
              className="ame-btn-secondary ame-btn-xs"
            >
              <Download size={12} aria-hidden />{" "}
              {t(I18nKey.SYNTH$MASK_DOWNLOAD_CSV)}
            </button>
            <button
              type="button"
              data-testid="synth-mask-download-json"
              onClick={() =>
                downloadFile({
                  path: `${result.fileName}.masked.json`,
                  content: `${JSON.stringify(result.rows, null, 2)}\n`,
                  mimeType: "application/json",
                })
              }
              className="ame-btn-secondary ame-btn-xs"
            >
              <Download size={12} aria-hidden />{" "}
              {t(I18nKey.SYNTH$MASK_DOWNLOAD_JSON)}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
