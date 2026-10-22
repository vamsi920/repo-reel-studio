import {
  primaryKeyOf,
  slugId,
  type Distribution,
  type Entity,
  type Field,
  type FieldType,
  type Row,
} from "./model";
import { inferSemantic, piiClassOf } from "./semantics";
import { detectColumnSemantic } from "./pii-detect";
import { FREE_TEXT_SEMANTICS } from "./pii-catalog";

/**
 * Learning a table's shape from sample rows (a CSV export, a JSON dump, a
 * fixture file), for when the user has data but no schema file.
 *
 * What is kept: column types, nullability, uniqueness, lengths, observed
 * numeric ranges, null rates, and value mixes of NON-personal categorical
 * columns (statuses, plans, countries). What is never kept: any value of a
 * personal column, any free text, any example row. The sample itself is
 * read once and dropped.
 */

const INTEGER = /^-?(0|[1-9]\d*)$/;
const DECIMAL = /^-?\d+\.\d+$/;
const DATE = /^\d{4}-\d\d-\d\d$/;
const DATETIME =
  /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOOLEAN = /^(true|false|yes|no|t|f|y|n)$/i;
const IDENTIFIER_NAME =
  /(^|_)(id|uuid|guid|code|sku|slug|key|number|no|ref|reference|email|username|handle|login)($|_)|Id$/;
const UNIQUE_SEMANTICS: readonly string[] = [
  "id",
  "uuid",
  "email",
  "username",
  "ssn",
  "national_id",
  "passport_number",
  "card_number",
  "iban",
  "slug",
  "sku",
];

/** Rounds an observed length up to a column size people actually declare. */
function niceLength(n: number): number {
  for (const size of [8, 16, 32, 64, 128, 255, 512, 1000, 2000, 4000]) {
    if (n <= size) return size;
  }
  return n;
}

function typeOf(values: unknown[]): { type: FieldType; scale?: number } {
  if (values.length === 0) return { type: "string" };
  if (values.every((v) => typeof v === "boolean" || BOOLEAN.test(String(v)))) {
    return { type: "boolean" };
  }
  if (values.some((v) => typeof v === "object")) return { type: "json" };
  const text = values.map((v) => String(v).trim());
  if (text.every((v) => INTEGER.test(v))) return { type: "integer" };
  if (text.every((v) => INTEGER.test(v) || DECIMAL.test(v))) {
    const scale = Math.max(...text.map((v) => (v.split(".")[1] ?? "").length));
    return { type: "decimal", scale };
  }
  if (text.every((v) => DATE.test(v))) return { type: "date" };
  if (text.every((v) => DATETIME.test(v))) return { type: "datetime" };
  if (text.every((v) => UUID.test(v))) return { type: "uuid" };
  const longest = Math.max(...text.map((v) => v.length));
  return { type: longest > 255 ? "text" : "string" };
}

function isPresent(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

function toValue(type: FieldType, v: unknown): unknown {
  if (type === "integer" || type === "decimal") return Number(v);
  return v;
}

export interface SampleInference {
  entity: Entity;
  rows: number;
  /** Columns recognised as personal by their values (names said nothing). */
  detectedByValue: string[];
}

/** An entity (fields + statistics) learned from sample rows. */
export function inferEntityFromSample(
  name: string,
  columns: string[],
  rows: Row[],
  source = "sample",
): SampleInference {
  const entityId = slugId(name);
  const detectedByValue: string[] = [];
  const fields: Field[] = columns.map((column) => {
    const all = rows.map((r) => r[column]);
    const present = all.filter(isPresent);
    const { type, scale } = typeOf(present);
    const field: Field = { name: column, type };
    if (scale !== undefined) field.scale = scale;
    const nullCount = all.length - present.length;
    if (nullCount > 0) field.nullable = true;

    const byValue =
      type === "string" || type === "text"
        ? detectColumnSemantic(present)
        : null;
    const byName = inferSemantic(column, type, { entity: name });
    field.semantic = byValue ?? byName;
    if (byValue && byValue !== byName) detectedByValue.push(column);
    const personal = piiClassOf(field) !== "none";

    const distinct = new Set(present.map((v) => String(v)));
    // A small sample without repeats proves little: only identifier-like
    // columns (or a large sample) are taken to be unique.
    const identifierLike =
      IDENTIFIER_NAME.test(column) || UNIQUE_SEMANTICS.includes(field.semantic);
    if (
      distinct.size === present.length &&
      nullCount === 0 &&
      type !== "boolean" &&
      ((present.length >= 5 && identifierLike) || present.length >= 200)
    ) {
      field.unique = true;
    }
    if (/^(id|_id|pk)$/i.test(column) && field.unique) {
      field.primaryKey = true;
      field.semantic = "id";
    }
    if (type === "string" || type === "text") {
      const longest = Math.max(0, ...present.map((v) => String(v).length));
      if (longest) field.maxLength = niceLength(longest);
    }

    if ((type === "integer" || type === "decimal") && !field.unique) {
      const nums = present.map(Number).filter(Number.isFinite);
      if (nums.length) {
        // Observed bounds describe values, not keys (ids are renumbered).
        field.min = Math.min(...nums);
        field.max = Math.max(...nums);
        if (nums.length >= 5 && !field.primaryKey) {
          const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
          const variance =
            nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
          field.distribution = {
            kind: "normal",
            mean: Number(mean.toFixed(4)),
            stddev: Number(Math.sqrt(variance).toFixed(4)),
          };
        }
      }
    }

    // A short list of repeated labels is an enum -- unless it is personal
    // data or free text, whose values are never kept.
    const freeText =
      FREE_TEXT_SEMANTICS.includes(field.semantic) &&
      field.semantic !== "generic";
    if (
      !personal &&
      !freeText &&
      !field.unique &&
      (type === "string" || type === "integer") &&
      distinct.size >= 2 &&
      distinct.size <= 12 &&
      present.length >= distinct.size * 2 &&
      [...distinct].every((v) => v.length <= 40)
    ) {
      const weights: Record<string, number> = {};
      for (const v of present)
        weights[String(v)] = (weights[String(v)] ?? 0) + 1;
      const distribution: Distribution = { kind: "categorical", weights };
      field.distribution = distribution;
      if (type === "string") {
        field.type = "enum";
        field.enumValues = [...distinct];
        delete field.maxLength;
      }
    } else if (personal && nullCount > 0 && all.length >= 5) {
      field.distribution = {
        kind: "null_rate",
        rate: Number((nullCount / all.length).toFixed(3)),
      };
    }
    if (personal) {
      // Statistics of personal numbers (age, salary) are aggregates; their
      // exact bounds are not needed and can single someone out.
      delete field.min;
      delete field.max;
    }
    // Keep values typed the way they will be generated.
    if (field.defaultValue !== undefined) {
      field.defaultValue = toValue(field.type, field.defaultValue);
    }
    return field;
  });
  return {
    entity: {
      id: entityId,
      name,
      fields,
      evidence: [
        `${source}: ${rows.length} sample rows (shape and statistics only)`,
      ],
      source: "manual",
    },
    rows: rows.length,
    detectedByValue,
  };
}

function singular(word: string): string[] {
  const w = word.toLowerCase();
  return [w, `${w}s`, `${w}es`, w.replace(/y$/, "ies")];
}

/**
 * Links `<thing>_id` / `<thing>Id` columns to the entity named after the
 * thing when nothing declared the foreign key (sample files, loose JSON).
 * Returns only the entities that changed.
 */
export function linkReferencesByName(entities: Entity[]): Entity[] {
  const byName = new Map<string, Entity>();
  for (const e of entities) {
    byName.set(e.id.toLowerCase(), e);
    byName.set(e.name.toLowerCase(), e);
  }
  const changed: Entity[] = [];
  for (const entity of entities) {
    let touched = false;
    const fields = entity.fields.map((field) => {
      if (field.references || field.primaryKey) return field;
      const m = field.name.match(/^(.+?)_?(?:id|Id|ID)$/);
      if (!m?.[1]) return field;
      const base = m[1].replace(/_$/, "");
      for (const candidate of singular(base)) {
        const target = byName.get(candidate);
        if (!target || target.id === entity.id) continue;
        const pk = primaryKeyOf(target);
        if (!pk) continue;
        touched = true;
        // A foreign key holds its parent's values, not its own: drop the
        // statistics and labels learned for it.
        const {
          distribution: _distribution,
          enumValues: _enumValues,
          unique: _unique,
          maxLength: _maxLength,
          min: _min,
          max: _max,
          ...rest
        } = field;
        return {
          ...rest,
          type: pk.type,
          references: { entity: target.id, field: pk.name },
          semantic: "id" as const,
        };
      }
      return field;
    });
    if (touched) changed.push({ ...entity, fields });
  }
  return changed;
}
