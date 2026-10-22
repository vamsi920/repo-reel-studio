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
import { FREE_TEXT_SEMANTICS, isHighRiskSemantic } from "./pii-catalog";
import { detectColumnSemantic, scrubFreeText } from "./pii-detect";
import { personaFrom, placeFrom, valueFor, type RowContext } from "./values";

export { parseCsv, parseTabular, type TabularFile } from "./tabular";

/**
 * Privacy: which fields carry personal data, what the user chose to do
 * with each, and how that choice is applied to generated data and to a
 * real export the user wants scrubbed.
 *
 * The rules a scrubbed export keeps, whatever the user picked:
 * - A key that holds personal data (an email primary key, the foreign keys
 *   that point at it) is pseudonymized with the same token everywhere, so
 *   the export still joins and never shows the original.
 * - A synthetic replacement depends on the original value and its meaning,
 *   not the column name, so the same person is the same fake person in
 *   every table; names, emails and addresses of one row stay coherent.
 * - Free text and JSON are scanned for personal data that a column name
 *   would never reveal (an email in a note, an SSN in a payload).
 */

export type PrivacyStrategy = PrivacyTreatment;

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
  /**
   * High-risk identifiers and sensitive fields still on the default: the
   * user should decide whether synthetic values are acceptable.
   */
  undecided: { entity: string; field: string; semantic: string }[];
}

function semanticOf(field: Field): SemanticKind {
  return (
    field.semantic ??
    inferSemantic(field.name, field.type, { description: field.description })
  );
}

function isKey(field: Field): boolean {
  return Boolean(field.primaryKey || field.references);
}

function isText(field: Field): boolean {
  return field.type === "string" || field.type === "text";
}

const NUMERIC = new Set(["integer", "float", "decimal"]);

/** Masking keeps a tail of the original string, so text columns only. */
export function canMask(field: Field): boolean {
  return !isKey(field) && isText(field);
}

/** A placeholder string, or null where the column allows it. */
export function canRedact(field: Field): boolean {
  return !isKey(field) && (isText(field) || Boolean(field.nullable));
}

/** A token per value: text columns (keys included, in exports). */
export function canPseudonymize(field: Field): boolean {
  return isText(field);
}

/** Dates, numbers, postcodes and coordinates can be coarsened. */
export function canGeneralize(field: Field): boolean {
  if (isKey(field)) return false;
  if (field.type === "date" || field.type === "datetime") return true;
  if (NUMERIC.has(field.type)) return true;
  const semantic = semanticOf(field);
  return (
    isText(field) && (semantic === "postal_code" || semantic === "geolocation")
  );
}

export function canApply(field: Field, treatment: PrivacyTreatment): boolean {
  switch (treatment) {
    case "mask":
      return canMask(field);
    case "redact":
      return canRedact(field);
    case "pseudonymize":
      return !isKey(field) && canPseudonymize(field);
    case "generalize":
      return canGeneralize(field);
    default:
      return !isKey(field);
  }
}

/** What happens to a field's values in generated data. */
export function strategyFor(field: Field): PrivacyStrategy {
  if (isKey(field) || piiClassOf(field) === "none") return "keep";
  if (field.treatment && canApply(field, field.treatment)) {
    return field.treatment;
  }
  return "synthesize";
}

type ExportStrategy = PrivacyStrategy | "scrub_text" | "scrub_json";

/** What happens to a field's values in a real export. */
export function exportStrategyFor(field: Field): ExportStrategy {
  const pii = piiClassOf(field);
  if (isKey(field)) {
    // Personal keys must not leak, and must still join.
    return pii !== "none" && canPseudonymize(field) ? "pseudonymize" : "keep";
  }
  if (pii !== "none") return strategyFor(field);
  if (field.treatment === "keep") return "keep";
  if (field.type === "json") return "scrub_json";
  if (
    (isText(field) || field.type === "unknown") &&
    FREE_TEXT_SEMANTICS.includes(semanticOf(field))
  ) {
    return "scrub_text";
  }
  return "keep";
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
    // A short column gets stars rather than a cut-off "[REDACTE".
    if (field.maxLength && field.maxLength < REDACTED.length) {
      return "*".repeat(Math.max(1, Math.min(field.maxLength, 3)));
    }
    return REDACTED;
  }
  return null;
}

/** Stable opaque token: same input and seed, same token; nothing readable. */
export function pseudonymValue(
  value: unknown,
  seed: number | string,
  maxLength?: number,
): string {
  const text = String(value);
  const a = hashString(`${seed}|psn|${text}`).toString(16).padStart(8, "0");
  const b = hashString(`${text}|psn|${seed}`).toString(16).padStart(8, "0");
  const token = `PSN-${a}${b}`;
  return maxLength ? token.slice(0, maxLength) : token;
}

function clamp(value: number, field: Field): number {
  let v = value;
  if (field.min !== undefined) v = Math.max(v, field.min);
  if (field.max !== undefined) v = Math.min(v, field.max);
  return v;
}

/**
 * Coarsens a value: a date to January 1st of its year, an age to its
 * decade, an amount to two significant figures, coordinates to one decimal
 * (~10 km), a postcode to its area. Types are kept so the data still loads.
 */
export function generalizeValue(value: unknown, field: Field): unknown {
  if (value === null || value === undefined) return value;
  const semantic = semanticOf(field);
  if (field.type === "date" || field.type === "datetime") {
    const year = String(value).slice(0, 4);
    if (!/^\d{4}$/.test(year)) return value;
    return field.type === "date"
      ? `${year}-01-01`
      : `${year}-01-01T00:00:00.000Z`;
  }
  if (NUMERIC.has(field.type)) {
    const n = Number(value);
    if (!Number.isFinite(n)) return value;
    let out: number;
    if (semantic === "latitude" || semantic === "longitude") {
      out = Math.round(n * 10) / 10;
    } else if (
      semantic === "age" ||
      semantic === "count" ||
      semantic === "quantity" ||
      semantic === "year"
    ) {
      out = Math.floor(n / 10) * 10;
    } else if (n === 0) {
      out = 0;
    } else {
      const magnitude = 10 ** (Math.floor(Math.log10(Math.abs(n))) - 1);
      out = Math.round(n / magnitude) * magnitude;
    }
    out = clamp(out, field);
    return field.type === "integer" ? Math.round(out) : Number(out.toFixed(2));
  }
  const text = String(value);
  if (semantic === "geolocation") {
    const parts = text.split(",").map((p) => Number(p.trim()));
    return parts.every(Number.isFinite)
      ? parts.map((p) => (Math.round(p * 10) / 10).toFixed(1)).join(",")
      : REDACTED;
  }
  if (semantic === "postal_code") {
    const keep = text.replace(/\s+/g, "").slice(0, 3);
    return `${keep}${"*".repeat(Math.max(0, text.length - keep.length))}`;
  }
  return value;
}

function applyOne(
  value: unknown,
  field: Field,
  strategy: PrivacyStrategy,
  seed: number | string,
): unknown {
  if (value === null || value === undefined) return value;
  switch (strategy) {
    case "mask":
      return maskValue(String(value), field.maxLength);
    case "redact":
      return redactValue(field);
    case "pseudonymize":
      return pseudonymValue(value, seed, field.maxLength);
    case "generalize":
      return generalizeValue(value, field);
    default:
      return value;
  }
}

/**
 * Applies the user's choices to generated rows in place. Returns the
 * fields whose uniqueness or shape is not preserved (mask, generalize,
 * redact), which the validator then does not hold to unique/pattern.
 */
export function applyTreatments(
  entity: Entity,
  rows: Row[],
  seed: number | string = 0,
): string[] {
  const lossy: string[] = [];
  for (const field of entity.fields) {
    const strategy = strategyFor(field);
    if (strategy === "synthesize" || strategy === "keep") continue;
    if (strategy !== "pseudonymize") lossy.push(field.name);
    for (const row of rows) {
      row[field.name] = applyOne(row[field.name], field, strategy, seed);
    }
  }
  return lossy;
}

/** Treatments that lose uniqueness / declared shape. */
export function isLossy(strategy: PrivacyStrategy): boolean {
  return (
    strategy === "mask" || strategy === "redact" || strategy === "generalize"
  );
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
    pseudonymize: 0,
    mask: 0,
    generalize: 0,
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
      const strategy = isKey(field) ? "pseudonymize" : strategyFor(field);
      strategies[strategy] += 1;
      if (
        !field.treatment &&
        !isKey(field) &&
        (isHighRiskSemantic(semantic) || pii === "sensitive")
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

/* ── Scrubbing a real export ───────────────────────────────────────────── */

/** Meanings that describe one person and must stay coherent within a row. */
const PERSON_SEMANTICS: readonly SemanticKind[] = [
  "email",
  "full_name",
  "first_name",
  "last_name",
  "username",
  "social_profile",
];
const PLACE_SEMANTICS: readonly SemanticKind[] = [
  "street",
  "city",
  "state",
  "postal_code",
  "country",
  "country_code",
  "latitude",
  "longitude",
  "geolocation",
];

function anchorOf(
  row: Row,
  fields: Field[],
  kinds: readonly SemanticKind[],
): string | null {
  for (const kind of kinds) {
    const f = fields.find((x) => semanticOf(x) === kind);
    const v = f ? row[f.name] : undefined;
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      return `${kind}:${String(v).trim().toLowerCase()}`;
    }
  }
  return null;
}

/**
 * Replaces personal values inside a JSON payload (keys reveal meaning,
 * strings are scanned like free text). Returns the cleaned value and how
 * many personal details were found.
 */
function scrubJsonValue(
  value: unknown,
  seed: number | string,
  now: Date,
): { value: unknown; found: number } {
  if (Array.isArray(value)) {
    let found = 0;
    const out = value.map((v) => {
      const r = scrubJsonValue(v, seed, now);
      found += r.found;
      return r.value;
    });
    return { value: out, found };
  }
  if (value && typeof value === "object") {
    let found = 0;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const type =
        typeof v === "number"
          ? Number.isInteger(v)
            ? "integer"
            : "float"
          : typeof v === "boolean"
            ? "boolean"
            : "string";
      const semantic = inferSemantic(key, type);
      const field: Field = { name: key, type, semantic };
      if (v !== null && typeof v !== "object" && piiClassOf(field) !== "none") {
        found += 1;
        out[key] = syntheticFor(field, semantic, v, seed, now, 0);
        continue;
      }
      const r = scrubJsonValue(v, seed, now);
      found += r.found;
      out[key] = r.value;
    }
    return { value: out, found };
  }
  if (typeof value === "string") {
    const scrubbed = scrubFreeText(value);
    return { value: scrubbed.text, found: scrubbed.found };
  }
  return { value, found: 0 };
}

function syntheticFor(
  field: Field,
  semantic: SemanticKind,
  original: unknown,
  seed: number | string,
  now: Date,
  index: number,
  personSeed?: number,
  placeSeed?: number,
): unknown {
  // Keyed by meaning + value, not column name: the same SSN in two tables
  // gets the same replacement.
  const valueSeed = hashString(
    `${seed}:${semantic}:${String(original).trim().toLowerCase()}`,
  );
  if (semantic === "password_hash" || semantic === "token") {
    return `masked_${valueSeed.toString(16)}`;
  }
  const rng = createRng(valueSeed);
  const pSeed = personSeed ?? valueSeed;
  const ctx: RowContext = {
    rng,
    index,
    persona: personaFrom(createRng(pSeed), pSeed % 10_000_000),
    place: placeFrom(createRng(placeSeed ?? valueSeed)),
    now,
  };
  return valueFor(field, semantic, ctx);
}

export interface MaskResult {
  rows: Row[];
  /** Values replaced (column choices) plus personal data found in text. */
  masked: number;
  perField: Record<string, number>;
  /** Personal details found inside free text / JSON and removed. */
  freeTextFound: number;
}

/**
 * Scrubs a real export of `entity` with the rules described at the top of
 * this file. Nulls and empty cells stay as they are.
 */
export function maskRows(
  entity: Entity,
  rows: Row[],
  seed: number | string,
  now: Date = new Date(),
): MaskResult {
  const plan = new Map<string, ExportStrategy>();
  for (const field of entity.fields) {
    const strategy = exportStrategyFor(field);
    if (strategy !== "keep") plan.set(field.name, strategy);
  }
  const perField: Record<string, number> = {};
  let masked = 0;
  const stats = { found: 0 };
  if (plan.size === 0) return { rows, masked, perField, freeTextFound: 0 };
  const out = rows.map((row, index) => {
    const next: Row = { ...row };
    const person = anchorOf(row, entity.fields, PERSON_SEMANTICS);
    const placeAnchor = anchorOf(row, entity.fields, PLACE_SEMANTICS);
    const personSeed = person
      ? hashString(`${seed}|person|${person}`)
      : undefined;
    const placeSeed = placeAnchor
      ? hashString(`${seed}|place|${person ?? placeAnchor}`)
      : undefined;
    for (const field of entity.fields) {
      const strategy = plan.get(field.name);
      if (!strategy) continue;
      const original = row[field.name];
      if (original === null || original === undefined || original === "") {
        continue;
      }
      const semantic = semanticOf(field);
      let replaced: unknown;
      if (strategy === "scrub_text") {
        const scrubbed = scrubFreeText(String(original));
        stats.found += scrubbed.found;
        replaced = scrubbed.text;
        if (scrubbed.found === 0) continue;
      } else if (strategy === "scrub_json") {
        let parsed: unknown = original;
        if (typeof original === "string") {
          try {
            parsed = JSON.parse(original);
          } catch {
            const scrubbed = scrubFreeText(original);
            stats.found += scrubbed.found;
            if (scrubbed.found) next[field.name] = scrubbed.text;
            continue;
          }
        }
        const cleaned = scrubJsonValue(parsed, seed, now);
        stats.found += cleaned.found;
        if (cleaned.found === 0) continue;
        replaced =
          typeof original === "string"
            ? JSON.stringify(cleaned.value)
            : cleaned.value;
      } else if (strategy === "synthesize") {
        // An email is its own identity (same address, same replacement in
        // every table); the row's other person fields follow the person
        // anchored on the row's first email or name.
        const ownSeed =
          semantic === "email"
            ? hashString(
                `${seed}|person|email:${String(original).trim().toLowerCase()}`,
              )
            : undefined;
        replaced = syntheticFor(
          field,
          semantic,
          original,
          seed,
          now,
          index,
          ownSeed ??
            (PERSON_SEMANTICS.includes(semantic) ? personSeed : undefined),
          PLACE_SEMANTICS.includes(semantic) ? placeSeed : undefined,
        );
      } else {
        replaced = applyOne(original, field, strategy, seed);
      }
      next[field.name] = replaced;
      masked += 1;
      perField[field.name] = (perField[field.name] ?? 0) + 1;
    }
    return next;
  });
  return { rows: out, masked, perField, freeTextFound: stats.found };
}

/**
 * The entity to mask a file with: the model's fields for columns it knows,
 * plus a field for every column it does not, judged by name and then by
 * the values in the file, so an unmodelled `col7` full of emails is not
 * let through.
 */
export function entityForColumns(
  entity: Entity,
  columns: string[],
  rows: Row[] = [],
): { entity: Entity; unknownColumns: string[] } {
  const known = new Map(entity.fields.map((f) => [f.name, f]));
  const unknownColumns = columns.filter((c) => !known.has(c));
  const fields: Field[] = columns.map((c) => {
    const field = known.get(c);
    if (field) return field;
    const values = rows.slice(0, 500).map((r) => r[c]);
    const looksLike = detectColumnSemantic(values);
    const looksJson = values.some((v) => typeof v === "object" && v !== null);
    const type = looksJson ? "json" : "string";
    return {
      name: c,
      type,
      semantic: looksLike ?? inferSemantic(c, type, { entity: entity.name }),
    };
  });
  return { entity: { ...entity, fields }, unknownColumns };
}

/** Human-readable privacy summary, written next to a run. */
export function privacyReportMarkdown(report: PrivacyReport): string {
  const s = report.strategies;
  const lines = [
    "# Privacy report",
    "",
    `Direct identifiers: ${report.counts.direct} · Quasi-identifiers: ${report.counts.quasi} · Sensitive: ${report.counts.sensitive} · Other: ${report.counts.none}`,
    `Synthesized: ${s.synthesize} · Pseudonymized: ${s.pseudonymize} · Masked: ${s.mask} · Generalized: ${s.generalize} · Redacted: ${s.redact}`,
    "",
    "Every value in this dataset is synthetic. No real record was sampled. Identifiers come from ranges that are never issued for real: emails on reserved example domains, phone numbers in the fictional 555-0100..0199 block, SSNs in area 9xx with group 00, published card-network test numbers, EIN prefix 00, IBANs with the non-existent bank code TEST, ABA routing prefix 99, test BICs, locally administered MAC addresses, TEST-prefixed passports, licences, medical record and insurance numbers, IP addresses from the RFC 5737 documentation networks. Special-category values are neutral placeholders.",
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
