import type {
  DataModel,
  Entity,
  Field,
  PiiClass,
  PrivacyTreatment,
  Row,
  SemanticKind,
} from "./model";
import { createRng, hashString } from "./rng";
import { inferSemantic, piiClassOf } from "./semantics";
import { personaFrom, placeFrom, valueFor, type RowContext } from "./values";

/**
 * Privacy: which fields carry personal data, what the user chose to do with
 * each (synthesize, mask, redact), and how to apply that both to generated
 * data and to a real export the user wants scrubbed. Replacements are
 * consistent: the same real value maps to the same synthetic value
 * everywhere, so joins survive.
 */

export type PrivacyStrategy = PrivacyTreatment | "keep";

export interface PiiFinding {
  entity: string;
  field: string;
  pii: PiiClass;
  semantic: string;
  strategy: PrivacyStrategy;
  /** Whether the user picked the strategy (false: the default applied). */
  chosen: boolean;
}

export interface PrivacyReport {
  findings: PiiFinding[];
  counts: Record<PiiClass, number>;
  /** Entities with at least one direct identifier. */
  entitiesWithPii: string[];
  /** Strategy counts over personal fields. */
  strategies: Record<PrivacyStrategy, number>;
  /** High-risk identifiers still on the default (synthesize). */
  undecided: { entity: string; field: string; semantic: string }[];
}

/**
 * Identifiers where a value that merely looks real is already a problem
 * (it could belong to someone). Synthetic values for these come from
 * never-issued ranges, but the user is asked whether to mask or redact.
 */
export const HIGH_RISK_SEMANTICS: readonly SemanticKind[] = [
  "ssn",
  "national_id",
  "tax_id",
  "card_number",
  "iban",
];

function semanticOf(field: Field): SemanticKind {
  return field.semantic ?? inferSemantic(field.name, field.type);
}

function isKey(field: Field): boolean {
  return Boolean(field.primaryKey || field.references);
}

function isText(field: Field): boolean {
  return field.type === "string" || field.type === "text";
}

/** Masking keeps a tail of the original string, so text columns only. */
export function canMask(field: Field): boolean {
  return !isKey(field) && isText(field);
}

/** A placeholder string, or null where the column allows it. */
export function canRedact(field: Field): boolean {
  return !isKey(field) && (isText(field) || Boolean(field.nullable));
}

/** What actually happens to a field's values. */
export function strategyFor(field: Field): PrivacyStrategy {
  if (isKey(field) || piiClassOf(field) === "none") return "keep";
  if (field.treatment === "mask" && canMask(field)) return "mask";
  if (field.treatment === "redact" && canRedact(field)) return "redact";
  return "synthesize";
}

export const REDACTED = "[REDACTED]";

/**
 * Keeps the last four letters/digits and stars the rest, separators
 * untouched (`***-**-1234`); an email keeps its first letter and domain.
 */
export function maskValue(value: string, maxLength?: number): string {
  let out: string;
  const at = value.indexOf("@");
  if (at > 0) {
    out = `${value[0]}***${value.slice(at)}`;
  } else {
    const alnum = value.replace(/[^A-Za-z0-9]/g, "").length;
    let seen = 0;
    out = value.replace(/[A-Za-z0-9]/g, (ch) => {
      seen += 1;
      return alnum > 4 && seen > alnum - 4 ? ch : "*";
    });
  }
  return maxLength ? out.slice(-maxLength) : out;
}

export function redactValue(field: Field): unknown {
  if (isText(field)) {
    return field.maxLength ? REDACTED.slice(0, field.maxLength) : REDACTED;
  }
  return null;
}

/**
 * Applies the mask/redact choices to generated rows in place. Returns the
 * fields that were treated (their uniqueness is not preserved, so the
 * validator skips unique and pattern checks on them).
 */
export function applyTreatments(entity: Entity, rows: Row[]): string[] {
  const treated: string[] = [];
  for (const field of entity.fields) {
    const strategy = strategyFor(field);
    if (strategy !== "mask" && strategy !== "redact") continue;
    treated.push(field.name);
    for (const row of rows) {
      const v = row[field.name];
      if (v === null || v === undefined) continue;
      row[field.name] =
        strategy === "mask"
          ? maskValue(String(v), field.maxLength)
          : redactValue(field);
    }
  }
  return treated;
}

export function privacyReport(model: DataModel): PrivacyReport {
  const findings: PiiFinding[] = [];
  const counts: Record<PiiClass, number> = {
    direct: 0,
    quasi: 0,
    sensitive: 0,
    none: 0,
  };
  const strategies: Record<PrivacyStrategy, number> = {
    synthesize: 0,
    mask: 0,
    redact: 0,
    keep: 0,
  };
  const undecided: PrivacyReport["undecided"] = [];
  const entitiesWithPii = new Set<string>();
  for (const entity of model.entities) {
    for (const field of entity.fields) {
      const pii = piiClassOf(field);
      counts[pii] += 1;
      if (pii === "none") continue;
      if (pii === "direct") entitiesWithPii.add(entity.id);
      const semantic = semanticOf(field);
      const strategy = strategyFor(field);
      strategies[strategy] += 1;
      if (
        !field.treatment &&
        !isKey(field) &&
        HIGH_RISK_SEMANTICS.includes(semantic)
      ) {
        undecided.push({ entity: entity.id, field: field.name, semantic });
      }
      findings.push({
        entity: entity.id,
        field: field.name,
        pii,
        semantic,
        strategy,
        chosen: Boolean(field.treatment),
      });
    }
  }
  return {
    findings,
    counts,
    entitiesWithPii: [...entitiesWithPii],
    strategies,
    undecided,
  };
}

/**
 * Scrubs a real export of `entity`. Per field: keep, a consistent
 * synthetic replacement (same original, same replacement), a mask or a
 * redaction. Nulls stay null, keys stay keys so the export still loads.
 */
export function maskRows(
  entity: Entity,
  rows: Row[],
  seed: number | string,
  now: Date = new Date(),
): { rows: Row[]; masked: number; perField: Record<string, number> } {
  const plan = new Map<string, PrivacyStrategy>();
  for (const field of entity.fields) {
    const strategy = strategyFor(field);
    if (strategy !== "keep") plan.set(field.name, strategy);
  }
  const perField: Record<string, number> = {};
  if (plan.size === 0) return { rows, masked: 0, perField };
  let masked = 0;
  const out = rows.map((row, index) => {
    const next: Row = { ...row };
    for (const field of entity.fields) {
      const strategy = plan.get(field.name);
      if (!strategy) continue;
      const original = row[field.name];
      if (original === null || original === undefined || original === "") {
        continue;
      }
      masked += 1;
      perField[field.name] = (perField[field.name] ?? 0) + 1;
      if (strategy === "mask") {
        next[field.name] = maskValue(String(original), field.maxLength);
        continue;
      }
      if (strategy === "redact") {
        next[field.name] = redactValue(field);
        continue;
      }
      const valueSeed = hashString(`${seed}:${field.name}:${String(original)}`);
      const semantic = semanticOf(field);
      if (semantic === "password_hash" || semantic === "token") {
        next[field.name] = `masked_${valueSeed.toString(16)}`;
        continue;
      }
      const rng = createRng(valueSeed);
      const ctx: RowContext = {
        rng,
        index,
        persona: personaFrom(rng.fork("persona"), valueSeed % 997),
        place: placeFrom(rng.fork("place")),
        now,
      };
      next[field.name] = valueFor(field, semantic, ctx);
    }
    return next;
  });
  return { rows: out, masked, perField };
}

/* ── Real exports: reading a file the user loads ───────────────────────── */

export interface TabularFile {
  columns: string[];
  rows: Row[];
}

/** RFC 4180 CSV (quoted fields, doubled quotes, CRLF), header row first. */
export function parseCsv(text: string): TabularFile {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === ",") {
      record.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || record.length) {
    record.push(cell);
    records.push(record);
  }
  const nonEmpty = records.filter((r) => !(r.length === 1 && r[0] === ""));
  const [header, ...body] = nonEmpty;
  if (!header?.length) return { columns: [], rows: [] };
  const columns = header.map((c) => c.trim());
  const rows = body.map((values) => {
    const row: Row = {};
    columns.forEach((c, i) => {
      const v = values[i];
      row[c] = v === undefined || v === "" ? null : v;
    });
    return row;
  });
  return { columns, rows };
}

/** A CSV with a header row, or a JSON array of objects. Null if neither. */
export function parseTabular(text: string): TabularFile | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed);
      if (!Array.isArray(data)) return null;
      const rows = data.filter(
        (r): r is Row =>
          Boolean(r) && typeof r === "object" && !Array.isArray(r),
      );
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      return columns.length ? { columns, rows } : null;
    } catch {
      return null;
    }
  }
  const csv = parseCsv(text);
  return csv.columns.length ? csv : null;
}

/**
 * The entity to mask a file with: the model's fields for columns it knows,
 * plus a text field for every column it does not. Unknown columns are
 * still judged by name, so an unmodelled `email` column is not let through.
 */
export function entityForColumns(
  entity: Entity,
  columns: string[],
): { entity: Entity; unknownColumns: string[] } {
  const known = new Map(entity.fields.map((f) => [f.name, f]));
  const unknownColumns = columns.filter((c) => !known.has(c));
  const fields: Field[] = columns.map((c) => {
    const field = known.get(c);
    if (field) return field;
    return { name: c, type: "string", semantic: inferSemantic(c, "string") };
  });
  return { entity: { ...entity, fields }, unknownColumns };
}

/** Human-readable privacy summary, written next to a run. */
export function privacyReportMarkdown(report: PrivacyReport): string {
  const lines = [
    "# Privacy report",
    "",
    `Direct identifiers: ${report.counts.direct} · Quasi-identifiers: ${report.counts.quasi} · Sensitive: ${report.counts.sensitive} · Other: ${report.counts.none}`,
    `Synthesized: ${report.strategies.synthesize} · Masked: ${report.strategies.mask} · Redacted: ${report.strategies.redact}`,
    "",
    "Every value in this dataset is synthetic. No real record was sampled. Identifiers come from ranges that are never issued for real: emails on reserved example domains, phone numbers in the fictional 555-0100..0199 block, SSNs in area 9xx with group 00, published card-network test numbers, EIN prefix 00, IBANs with the non-existent bank code TEST, IP addresses from the RFC 5737 documentation networks.",
    "",
    "| Entity | Field | Class | Meaning | Treatment |",
    "| --- | --- | --- | --- | --- |",
    ...report.findings.map(
      (f) =>
        `| ${f.entity} | ${f.field} | ${f.pii} | ${f.semantic} | ${f.strategy}${f.chosen ? "" : " (default)"} |`,
    ),
    "",
  ];
  return lines.join("\n");
}
