/**
 * Neo Synth data model.
 *
 * The model is what the studio knows about an application's data: entities
 * (tables, collections, API payloads), their fields with types and meaning,
 * the relations between them, the business rules the code enforces, and the
 * flows data takes through the system. Everything the generator, validator,
 * exporters and privacy report do is a pure function of this model plus a
 * seed, so a dataset is reproducible from `{model, scenario, seed}` alone.
 *
 * Nothing in here may hold real data: a profile carries category labels and
 * statistics, never sampled values of a record.
 */

export const FIELD_TYPES = [
  "string",
  "text",
  "integer",
  "float",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "time",
  "uuid",
  "json",
  "enum",
  "bytes",
  "array",
  "unknown",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** What a field means; drives which values look right. */
export const SEMANTIC_KINDS = [
  "id",
  "email",
  "first_name",
  "last_name",
  "full_name",
  "username",
  "password_hash",
  "phone",
  "url",
  "image_url",
  "ip_address",
  "uuid",
  "slug",
  "title",
  "description",
  "paragraph",
  "sentence",
  "word",
  "company",
  "job_title",
  "street",
  "city",
  "state",
  "country",
  "country_code",
  "postal_code",
  "latitude",
  "longitude",
  "currency_code",
  "amount",
  "price",
  "percentage",
  "quantity",
  "count",
  "age",
  "year",
  "created_at",
  "updated_at",
  "deleted_at",
  "date_past",
  "date_future",
  "birthdate",
  "boolean",
  "status",
  "color",
  "sku",
  "iban",
  "card_number",
  "tax_id",
  "national_id",
  "ssn",
  "token",
  "locale",
  "timezone",
  "mime_type",
  "file_name",
  "version",
  "hash",
  "json",
  "generic",
] as const;
export type SemanticKind = (typeof SEMANTIC_KINDS)[number];

/**
 * Privacy class of a field. `direct` identifies a person on its own,
 * `quasi` does so in combination, `sensitive` is special-category data
 * (health, finance, credentials).
 */
export const PII_CLASSES = ["direct", "quasi", "sensitive", "none"] as const;
export type PiiClass = (typeof PII_CLASSES)[number];

/**
 * What the generated data (or a masked export) holds for a personal field.
 * `synthesize` makes a fresh value from a range that is never issued for
 * real (default); `mask` keeps only the last four characters; `redact`
 * replaces the value with a placeholder, or null where the column allows it.
 */
export const PRIVACY_TREATMENTS = ["synthesize", "mask", "redact"] as const;
export type PrivacyTreatment = (typeof PRIVACY_TREATMENTS)[number];

export interface FieldReference {
  /** Entity id the field points at. */
  entity: string;
  /** Field on that entity (its primary key in the common case). */
  field: string;
}

/**
 * A value distribution recorded from a profile of real data. Only shapes;
 * a categorical distribution carries labels (e.g. status names), never a
 * sampled personal value.
 */
export type Distribution =
  | { kind: "categorical"; weights: Record<string, number> }
  | { kind: "normal"; mean: number; stddev: number }
  | { kind: "uniform"; min: number; max: number }
  | { kind: "null_rate"; rate: number };

export interface Field {
  name: string;
  type: FieldType;
  semantic?: SemanticKind;
  nullable?: boolean;
  unique?: boolean;
  primaryKey?: boolean;
  /** Auto-increment / database-generated. */
  generated?: boolean;
  references?: FieldReference;
  enumValues?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
  /** Decimal places for decimal/float fields. */
  scale?: number;
  /** A regular expression the value must match (JavaScript syntax). */
  pattern?: string;
  defaultValue?: unknown;
  description?: string;
  distribution?: Distribution;
  /** Explicit override of the inferred privacy class. */
  pii?: PiiClass;
  /** How a personal field is filled; `synthesize` when unset. */
  treatment?: PrivacyTreatment;
  /**
   * What the column holds, in the user's words, when its name does not say
   * (e.g. "internal order reference, always starts with ORD-"). Read by the
   * agent; the engine itself uses `examples`.
   */
  context?: string;
  /** Example values; generated rows draw from them when set. */
  examples?: string[];
  /** Element type for arrays. */
  items?: FieldType;
}

export const ENTITY_SOURCES = [
  "prisma",
  "sql",
  "json-schema",
  "openapi",
  "agent",
  "manual",
] as const;
export type EntitySource = (typeof ENTITY_SOURCES)[number];

export interface Entity {
  /** Stable id (snake_case of the name) so the agent can refine, not duplicate. */
  id: string;
  name: string;
  /** Physical table/collection name when it differs from the name. */
  table?: string;
  description?: string;
  fields: Field[];
  /** Files, KT pages, migrations that prove the shape. */
  evidence: string[];
  source?: EntitySource;
  /** Fields that must be unique together. */
  uniqueTogether?: string[][];
}

/**
 * Business rules the generator enforces and the validator checks. Each kind
 * is small enough to be both enforceable and explainable.
 */
export type RuleSpec =
  | {
      kind: "implies";
      /** When `if.field` is in `if.in` (or `if.isNull`) ... */
      if: { field: string; in?: unknown[]; isNull?: boolean };
      /** ... then `then.field` must be null / not null / one of / equal. */
      then: {
        field: string;
        isNull?: boolean;
        in?: unknown[];
        equals?: unknown;
      };
    }
  | {
      kind: "compare";
      field: string;
      op: "<" | "<=" | ">" | ">=" | "==";
      other: string;
    }
  | { kind: "unique_together"; fields: string[] }
  | { kind: "range"; field: string; min?: number; max?: number }
  | { kind: "pattern"; field: string; pattern: string };

export interface Rule {
  id: string;
  entity: string;
  description: string;
  spec: RuleSpec;
  evidence?: string[];
}

export interface DataFlow {
  id: string;
  name: string;
  /** Where the data is produced (component, service, endpoint). */
  from: string;
  /** Where it is consumed. */
  to: string;
  /** Transport: HTTP endpoint, queue, job, direct SQL. */
  via?: string;
  /** Entities moving along this flow, in order. */
  entities: string[];
  description?: string;
  evidence?: string[];
}

export interface DataModel {
  entities: Entity[];
  rules: Rule[];
  flows: DataFlow[];
}

export const EMPTY_MODEL: DataModel = Object.freeze({
  entities: [],
  rules: [],
  flows: [],
}) as DataModel;

export type Row = Record<string, unknown>;

/** Per-field override inside a scenario. */
export interface ScenarioOverride {
  entity: string;
  field: string;
  /** Fixed value set to draw from. */
  values?: unknown[];
  /** Weighted categorical values. */
  weights?: Record<string, number>;
  /** Share of rows the override applies to (default 1). */
  share?: number;
  /** Probability the field is null in overridden rows. */
  nullRate?: number;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  /** Rows per entity id. Missing entities get `defaultCount`. */
  counts: Record<string, number>;
  defaultCount?: number;
  /** Append boundary / unicode / null rows per entity. */
  edgeCases?: boolean;
  /** Probability a nullable field is null (default 0.1). */
  nullRate?: number;
  overrides?: ScenarioOverride[];
  /**
   * How parent popularity is distributed when children pick a parent:
   * `uniform` spreads evenly, `skewed` gives a few parents most children
   * (Zipf-like), which is what production usually looks like.
   */
  parentDistribution?: "uniform" | "skewed";
}

export interface Dataset {
  modelHash: string;
  scenarioId: string;
  seed: number;
  generatedAt: string;
  /** Entity ids in insertion order (parents before children where possible). */
  order: string[];
  tables: Record<string, Row[]>;
  /** Indices of rows that are deliberate edge cases, per entity. */
  edgeRows: Record<string, number[]>;
  warnings: string[];
}

export function slugId(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function primaryKeyOf(entity: Entity): Field | undefined {
  return (
    entity.fields.find((f) => f.primaryKey) ??
    entity.fields.find((f) => f.name === "id") ??
    entity.fields.find((f) => f.unique && !f.nullable)
  );
}

export function findEntity(
  model: DataModel,
  idOrName: string,
): Entity | undefined {
  const needle = idOrName.toLowerCase();
  return (
    model.entities.find((e) => e.id === idOrName) ??
    model.entities.find(
      (e) =>
        e.id === slugId(idOrName) ||
        e.name.toLowerCase() === needle ||
        e.table?.toLowerCase() === needle,
    )
  );
}

export interface Relation {
  fromEntity: string;
  fromField: string;
  toEntity: string;
  toField: string;
  /** A unique FK is a one-to-one. */
  oneToOne: boolean;
  optional: boolean;
}

export function relationsOf(model: DataModel): Relation[] {
  const out: Relation[] = [];
  for (const entity of model.entities) {
    for (const field of entity.fields) {
      if (!field.references) continue;
      out.push({
        fromEntity: entity.id,
        fromField: field.name,
        toEntity: field.references.entity,
        toField: field.references.field,
        oneToOne: Boolean(field.unique),
        optional: Boolean(field.nullable),
      });
    }
  }
  return out;
}

/** Entities ordered so a parent comes before its children; cycles kept stable. */
export function insertionOrder(model: DataModel): string[] {
  const ids = model.entities.map((e) => e.id);
  const deps = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
  for (const rel of relationsOf(model)) {
    if (rel.fromEntity !== rel.toEntity && deps.has(rel.toEntity)) {
      deps.get(rel.fromEntity)?.add(rel.toEntity);
    }
  }
  const order: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string) => {
    const s = state.get(id);
    if (s) return;
    state.set(id, "visiting");
    for (const dep of deps.get(id) ?? []) {
      if (state.get(dep) !== "visiting") visit(dep);
    }
    state.set(id, "done");
    order.push(id);
  };
  ids.forEach(visit);
  return order;
}

/** Problems that make a model ungeneratable, in words the agent can fix. */
export function modelProblems(model: DataModel): string[] {
  const problems: string[] = [];
  const byId = new Map(model.entities.map((e) => [e.id, e]));
  if (model.entities.length === 0) problems.push("no_entities");
  for (const entity of model.entities) {
    if (entity.fields.length === 0) problems.push(`${entity.id}: no_fields`);
    const names = new Set<string>();
    for (const field of entity.fields) {
      if (names.has(field.name)) {
        problems.push(`${entity.id}.${field.name}: duplicate_field`);
      }
      names.add(field.name);
      if (field.references) {
        const target = byId.get(field.references.entity);
        if (!target) {
          problems.push(
            `${entity.id}.${field.name}: references unknown entity ${field.references.entity}`,
          );
        } else if (
          !target.fields.some((f) => f.name === field.references?.field)
        ) {
          problems.push(
            `${entity.id}.${field.name}: references unknown field ${field.references.entity}.${field.references.field}`,
          );
        }
      }
      if (field.type === "enum" && !(field.enumValues?.length ?? 0)) {
        problems.push(`${entity.id}.${field.name}: enum_without_values`);
      }
    }
  }
  for (const rule of model.rules) {
    if (!byId.has(rule.entity)) {
      problems.push(`rule ${rule.id}: unknown entity ${rule.entity}`);
    }
  }
  return problems;
}

/** Stable fingerprint of the model so a run can say which model it came from. */
export function modelHash(model: DataModel): string {
  const text = JSON.stringify({
    e: model.entities.map((e) => ({
      id: e.id,
      t: e.table,
      f: e.fields.map((f) => ({
        n: f.name,
        t: f.type,
        s: f.semantic,
        r: f.references,
        e: f.enumValues,
        u: f.unique,
        p: f.primaryKey,
        nl: f.nullable,
        mn: f.min,
        mx: f.max,
        ml: f.maxLength,
        pi: f.pii,
        tr: f.treatment,
        ex: f.examples,
      })),
    })),
    r: model.rules.map((r) => r.spec),
  });
  // FNV-1a, 32-bit, hex: small, stable, dependency-free.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
