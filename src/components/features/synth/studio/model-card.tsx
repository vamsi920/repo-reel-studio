import React from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  Database,
  KeyRound,
  Link2,
  MessageSquarePlus,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  PII_CLASSES,
  PRIVACY_TREATMENTS,
  SEMANTIC_KINDS,
  relationsOf,
  type DataModel,
  type Entity,
  type Field,
  type PiiClass,
  type PrivacyTreatment,
  type SemanticKind,
} from "#/lib/synth/model";
import { inferSemantic, piiClassOf } from "#/lib/synth/semantics";
import { canMask, canRedact, strategyFor } from "#/lib/synth/privacy";
import { parseSchemaFile } from "#/lib/synth/parsers";
import { useSynthStudioStore } from "#/stores/synth-studio-store";

/**
 * The data model: every entity with its fields, what each field means, and
 * the relations between entities. Per field the user can correct the
 * meaning, mark whether it is personal data and choose what the generated
 * data holds for it (synthetic, masked, redacted), and add context or
 * example values when the column name says little. Schema files can be
 * imported from disk without the agent.
 */

const PII_DOT: Record<string, string> = {
  direct: "bg-[var(--danger-500,#dc2626)]",
  quasi: "bg-[var(--warning-500,#d97706)]",
  sensitive: "bg-[var(--primary-500)]",
};

const PII_LABEL_KEY: Record<PiiClass, I18nKey> = {
  direct: I18nKey.SYNTH$PII_CLASS_DIRECT,
  quasi: I18nKey.SYNTH$PII_CLASS_QUASI,
  sensitive: I18nKey.SYNTH$PII_CLASS_SENSITIVE,
  none: I18nKey.SYNTH$PII_CLASS_NONE,
};

const TREATMENT_LABEL_KEY: Record<PrivacyTreatment, I18nKey> = {
  synthesize: I18nKey.SYNTH$TREAT_SYNTHESIZE,
  mask: I18nKey.SYNTH$TREAT_MASK,
  redact: I18nKey.SYNTH$TREAT_REDACT,
};

const SELECT_CLASS =
  "ame-input max-w-[16ch] rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-transparent px-1 py-0.5 text-xs";
/** Privacy labels are sentences ("Identifies a person"): give them room. */
const WIDE_SELECT_CLASS = SELECT_CLASS.replace("max-w-[16ch]", "max-w-[26ch]");

/** Notes and example values the user gives a column the name does not explain. */
function FieldContextEditor({
  projectId,
  entity,
  field,
}: {
  projectId: string;
  entity: Entity;
  field: Field;
}) {
  const { t } = useTranslation("openhands");
  const updateField = useSynthStudioStore((s) => s.updateField);
  const [context, setContext] = React.useState(field.context ?? "");
  const [examples, setExamples] = React.useState(
    (field.examples ?? []).join(", "),
  );
  const save = () =>
    updateField(projectId, entity.id, field.name, {
      context: context.trim() || undefined,
      examples: examples
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 50),
    });
  return (
    <div
      data-testid={`synth-field-editor-${entity.id}-${field.name}`}
      className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1 text-[11px] text-[var(--text-secondary)]">
        {t(I18nKey.SYNTH$FIELD_CONTEXT)}
        <textarea
          rows={2}
          value={context}
          data-testid={`synth-field-context-${entity.id}-${field.name}`}
          placeholder={t(I18nKey.SYNTH$FIELD_CONTEXT_PLACEHOLDER)}
          onChange={(e) => setContext(e.target.value)}
          onBlur={save}
          className="ame-input rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-transparent px-2 py-1 text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-[var(--text-secondary)]">
        {t(I18nKey.SYNTH$FIELD_EXAMPLES)}
        <input
          type="text"
          value={examples}
          data-testid={`synth-field-examples-${entity.id}-${field.name}`}
          placeholder={t(I18nKey.SYNTH$FIELD_EXAMPLES_PLACEHOLDER)}
          onChange={(e) => setExamples(e.target.value)}
          onBlur={save}
          className="ame-input rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-transparent px-2 py-1 text-xs"
        />
        <span className="text-[var(--text-tertiary)]">
          {t(I18nKey.SYNTH$FIELD_EXAMPLES_HINT)}
        </span>
      </label>
    </div>
  );
}

function FieldRow({
  projectId,
  entity,
  field,
}: {
  projectId: string;
  entity: Entity;
  field: Field;
}) {
  const { t } = useTranslation("openhands");
  const updateField = useSynthStudioStore((s) => s.updateField);
  const [editing, setEditing] = React.useState(false);
  const semantic = field.semantic ?? inferSemantic(field.name, field.type);
  const pii = piiClassOf(field);
  const isKey = Boolean(field.primaryKey || field.references);
  const strategy = strategyFor(field);
  const flags = [
    field.nullable ? t(I18nKey.SYNTH$FIELD_NULLABLE) : null,
    field.unique && !field.primaryKey ? t(I18nKey.SYNTH$FIELD_UNIQUE) : null,
    field.generated ? t(I18nKey.SYNTH$FIELD_GENERATED) : null,
    field.distribution ? t(I18nKey.SYNTH$FIELD_PROFILED) : null,
    field.examples?.length ? t(I18nKey.SYNTH$FIELD_HAS_EXAMPLES) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <tr
        data-testid={`synth-field-${entity.id}-${field.name}`}
        data-pii={pii}
        data-treatment={strategy}
        className="border-t border-[var(--border-color)]"
      >
        <td className="py-1.5 pr-2 align-top">
          <span className="flex items-center gap-1.5 font-mono text-xs text-[var(--text-primary)]">
            {field.primaryKey ? (
              <KeyRound
                size={11}
                aria-label={t(I18nKey.SYNTH$FIELD_PK)}
                className="text-[var(--warning-600,#b45309)]"
              />
            ) : field.references ? (
              <Link2
                size={11}
                aria-label={t(I18nKey.SYNTH$FIELD_FK)}
                className="text-[var(--primary-500)]"
              />
            ) : null}
            {field.name}
            {pii !== "none" ? (
              <span
                aria-label={t(I18nKey.SYNTH$PII_LABEL, { kind: pii })}
                title={t(I18nKey.SYNTH$PII_LABEL, { kind: pii })}
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full",
                  PII_DOT[pii],
                )}
              />
            ) : null}
          </span>
          {field.references ? (
            <span className="block text-[11px] text-[var(--text-tertiary)]">
              → {field.references.entity}.{field.references.field}
            </span>
          ) : null}
          {flags ? (
            <span className="block text-[11px] text-[var(--text-tertiary)]">
              {flags}
            </span>
          ) : null}
          {field.context ? (
            <span
              className="block max-w-[28ch] truncate text-[11px] italic text-[var(--text-secondary)]"
              title={field.context}
            >
              {field.context}
            </span>
          ) : null}
        </td>
        <td className="py-1.5 pr-2 align-top text-xs text-[var(--text-secondary)]">
          {field.type}
          {field.enumValues?.length ? (
            <span
              className="block max-w-[18ch] truncate text-[11px] text-[var(--text-tertiary)]"
              title={field.enumValues.join(", ")}
            >
              {field.enumValues.slice(0, 4).join(" · ")}
              {field.enumValues.length > 4 ? " …" : ""}
            </span>
          ) : null}
          {field.maxLength ? (
            <span className="block text-[11px] text-[var(--text-tertiary)]">
              ≤ {field.maxLength}
            </span>
          ) : null}
        </td>
        <td className="py-1.5 pr-2 align-top">
          {isKey ? (
            <span className="text-xs text-[var(--text-tertiary)]">
              {semantic}
            </span>
          ) : (
            <select
              aria-label={t(I18nKey.SYNTH$FIELD_MEANING)}
              data-testid={`synth-semantic-${entity.id}-${field.name}`}
              value={semantic}
              onChange={(e) =>
                updateField(projectId, entity.id, field.name, {
                  semantic: e.target.value as SemanticKind,
                })
              }
              className={SELECT_CLASS}
            >
              {SEMANTIC_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          )}
        </td>
        <td className="py-1.5 pr-2 align-top">
          {isKey ? (
            <span className="text-xs text-[var(--text-tertiary)]">
              {t(I18nKey.SYNTH$PII_CLASS_NONE)}
            </span>
          ) : (
            <select
              aria-label={t(I18nKey.SYNTH$COL_PRIVACY)}
              data-testid={`synth-pii-${entity.id}-${field.name}`}
              value={pii}
              onChange={(e) =>
                updateField(projectId, entity.id, field.name, {
                  pii: e.target.value as PiiClass,
                })
              }
              className={WIDE_SELECT_CLASS}
            >
              {PII_CLASSES.map((kind) => (
                <option key={kind} value={kind}>
                  {t(PII_LABEL_KEY[kind])}
                </option>
              ))}
            </select>
          )}
        </td>
        <td className="py-1.5 pr-2 align-top">
          {strategy === "keep" ? (
            <span className="text-xs text-[var(--text-tertiary)]">
              {t(I18nKey.SYNTH$TREAT_NA)}
            </span>
          ) : (
            <select
              aria-label={t(I18nKey.SYNTH$COL_TREATMENT)}
              data-testid={`synth-treatment-${entity.id}-${field.name}`}
              value={strategy}
              onChange={(e) =>
                updateField(projectId, entity.id, field.name, {
                  treatment: e.target.value as PrivacyTreatment,
                })
              }
              className={WIDE_SELECT_CLASS}
            >
              {PRIVACY_TREATMENTS.map((treatment) => (
                <option
                  key={treatment}
                  value={treatment}
                  disabled={
                    (treatment === "mask" && !canMask(field)) ||
                    (treatment === "redact" && !canRedact(field))
                  }
                >
                  {t(TREATMENT_LABEL_KEY[treatment])}
                </option>
              ))}
            </select>
          )}
        </td>
        <td className="py-1.5 align-top">
          <button
            type="button"
            aria-expanded={editing}
            aria-label={t(I18nKey.SYNTH$FIELD_EDIT)}
            title={t(I18nKey.SYNTH$FIELD_EDIT)}
            data-testid={`synth-field-edit-${entity.id}-${field.name}`}
            onClick={() => setEditing((v) => !v)}
            className={cn(
              "ame-btn-icon ame-btn-icon-sm",
              (field.context || field.examples?.length) &&
                "text-[var(--primary-500)]",
            )}
          >
            <MessageSquarePlus size={13} aria-hidden />
          </button>
        </td>
      </tr>
      {editing ? (
        <tr className="border-t border-dashed border-[var(--border-color)]">
          <td colSpan={6}>
            <FieldContextEditor
              projectId={projectId}
              entity={entity}
              field={field}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function EntityBlock({
  projectId,
  entity,
}: {
  projectId: string;
  entity: Entity;
}) {
  const { t } = useTranslation("openhands");
  const [open, setOpen] = React.useState(false);
  const removeEntity = useSynthStudioStore((s) => s.removeEntity);
  const fks = entity.fields.filter((f) => f.references).length;
  const piiCount = entity.fields.filter((f) => piiClassOf(f) !== "none").length;
  return (
    <li
      data-testid={`synth-entity-${entity.id}`}
      className="rounded-[var(--radius-sm)] border border-[var(--border-color)]"
    >
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          aria-expanded={open}
          data-testid={`synth-entity-toggle-${entity.id}`}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown size={14} aria-hidden />
          ) : (
            <ChevronRight size={14} aria-hidden />
          )}
          <Database
            size={14}
            aria-hidden
            className="shrink-0 text-[var(--primary-500)]"
          />
          <span className="truncate text-sm font-medium text-[var(--text-primary)]">
            {entity.name}
          </span>
          <span className="truncate text-xs text-[var(--text-tertiary)]">
            {t(I18nKey.SYNTH$ENTITY_SUMMARY, {
              fields: entity.fields.length,
              relations: fks,
            })}
            {entity.table && entity.table !== entity.name
              ? ` · ${entity.table}`
              : ""}
            {entity.source ? ` · ${entity.source}` : ""}
          </span>
        </button>
        {piiCount ? (
          <span
            className="ame-badge ame-badge-warning shrink-0"
            title={t(I18nKey.SYNTH$PII_FIELDS, { count: piiCount })}
          >
            <ShieldAlert size={11} aria-hidden /> {piiCount}
          </span>
        ) : null}
        <button
          type="button"
          aria-label={t(I18nKey.SYNTH$REMOVE_ENTITY)}
          data-testid={`synth-entity-remove-${entity.id}`}
          onClick={() => removeEntity(projectId, entity.id)}
          className="ame-btn-icon ame-btn-icon-sm shrink-0"
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>
      {open ? (
        <div className="overflow-x-auto border-t border-[var(--border-color)] px-2.5 pb-2">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
                <th className="py-1.5 pr-2 font-medium">
                  {t(I18nKey.SYNTH$COL_FIELD)}
                </th>
                <th className="py-1.5 pr-2 font-medium">
                  {t(I18nKey.SYNTH$COL_TYPE)}
                </th>
                <th className="py-1.5 pr-2 font-medium">
                  {t(I18nKey.SYNTH$COL_MEANING)}
                </th>
                <th className="py-1.5 pr-2 font-medium">
                  {t(I18nKey.SYNTH$COL_PRIVACY)}
                </th>
                <th className="py-1.5 pr-2 font-medium">
                  {t(I18nKey.SYNTH$COL_TREATMENT)}
                </th>
                <th className="py-1.5 font-medium">
                  <span className="sr-only">{t(I18nKey.SYNTH$FIELD_EDIT)}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entity.fields.map((field) => (
                <FieldRow
                  key={field.name}
                  projectId={projectId}
                  entity={entity}
                  field={field}
                />
              ))}
            </tbody>
          </table>
          {entity.evidence.length ? (
            <p
              className="mt-2 truncate text-[11px] text-[var(--text-tertiary)]"
              title={entity.evidence.join("\n")}
            >
              {t(I18nKey.SYNTH$EVIDENCE)}:{" "}
              {entity.evidence.slice(0, 3).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ModelCard({
  projectId,
  model,
}: {
  projectId: string;
  model: DataModel;
}) {
  const { t } = useTranslation("openhands");
  const upsertEntities = useSynthStudioStore((s) => s.upsertEntities);
  const appendLog = useSynthStudioStore((s) => s.appendLog);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [importNote, setImportNote] = React.useState<string | null>(null);
  const relations = relationsOf(model);

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    let imported = 0;
    const warnings: string[] = [];
    for (const file of Array.from(list)) {
      const text = await file.text();
      const result = parseSchemaFile(file.name, text);
      imported += result.entities.length;
      warnings.push(...result.warnings);
      if (result.entities.length) upsertEntities(projectId, result.entities);
    }
    setImportNote(
      imported
        ? t(I18nKey.SYNTH$IMPORTED, { count: imported })
        : (warnings[0] ?? t(I18nKey.SYNTH$IMPORT_NOTHING)),
    );
    if (imported) {
      appendLog(projectId, {
        id: `log_${Date.now().toString(36)}`,
        level: "success",
        text: `Imported ${imported} entities from ${list.length} file(s)`,
        at: new Date().toISOString(),
      });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section
      data-testid="synth-model"
      className="ame-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="ame-eyebrow">{t(I18nKey.SYNTH$MODEL_TITLE)}</span>
          <span className="text-xs text-[var(--text-tertiary)]">
            {t(I18nKey.SYNTH$MODEL_SUMMARY, {
              entities: model.entities.length,
              relations: relations.length,
              rules: model.rules.length,
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".prisma,.sql,.json"
            className="hidden"
            data-testid="synth-import-input"
            onChange={(e) => void onFiles(e.target.files)}
          />
          <button
            type="button"
            data-testid="synth-import-button"
            onClick={() => fileRef.current?.click()}
            className="ame-btn-secondary ame-btn-xs"
          >
            <Upload size={12} aria-hidden /> {t(I18nKey.SYNTH$IMPORT_SCHEMA)}
          </button>
        </div>
      </div>
      {importNote ? (
        <p
          data-testid="synth-import-note"
          className="text-xs text-[var(--text-secondary)]"
        >
          {importNote}
        </p>
      ) : null}
      {model.entities.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">
          {t(I18nKey.SYNTH$MODEL_EMPTY)}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {model.entities.map((entity) => (
            <EntityBlock
              key={entity.id}
              projectId={projectId}
              entity={entity}
            />
          ))}
        </ul>
      )}
      {model.flows.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
            {t(I18nKey.SYNTH$FLOWS_TITLE)}
          </span>
          <ul className="flex flex-col gap-1">
            {model.flows.map((flow) => (
              <li
                key={flow.id}
                data-testid={`synth-flow-${flow.id}`}
                className="text-xs text-[var(--text-secondary)]"
              >
                <span className="font-medium text-[var(--text-primary)]">
                  {flow.name}
                </span>
                {" · "}
                {flow.from} → {flow.to}
                {flow.via ? ` (${flow.via})` : ""}
                {flow.entities.length ? ` · ${flow.entities.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function RulesCard({
  projectId,
  model,
}: {
  projectId: string;
  model: DataModel;
}) {
  const { t } = useTranslation("openhands");
  const removeRule = useSynthStudioStore((s) => s.removeRule);
  if (model.rules.length === 0) return null;
  return (
    <section
      data-testid="synth-rules"
      className="ame-card flex flex-col gap-2 p-4"
    >
      <span className="ame-eyebrow">{t(I18nKey.SYNTH$RULES_TITLE)}</span>
      <p className="text-xs text-[var(--text-tertiary)]">
        {t(I18nKey.SYNTH$RULES_HINT)}
      </p>
      <ul className="flex flex-col gap-1.5">
        {model.rules.map((rule) => (
          <li
            key={rule.id}
            data-testid={`synth-rule-${rule.id}`}
            className="flex items-start justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border-color)] px-2.5 py-2"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-sm text-[var(--text-primary)]">
                {rule.description}
              </span>
              <span className="truncate font-mono text-[11px] text-[var(--text-tertiary)]">
                {rule.entity} · {rule.spec.kind}
              </span>
            </div>
            <button
              type="button"
              aria-label={t(I18nKey.SYNTH$REMOVE_RULE)}
              data-testid={`synth-rule-remove-${rule.id}`}
              onClick={() => removeRule(projectId, rule.id)}
              className="ame-btn-icon ame-btn-icon-sm shrink-0"
            >
              <Trash2 size={13} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
