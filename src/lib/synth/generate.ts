import {
  insertionOrder,
  modelHash,
  primaryKeyOf,
  relationsOf,
  type DataModel,
  type Dataset,
  type Entity,
  type Field,
  type Row,
  type Rule,
  type Scenario,
  type ScenarioOverride,
} from "./model";
import { createRng, uuidFrom, type Rng } from "./rng";
import { inferSemantic } from "./semantics";
import { clampScenario } from "./scenarios";
import { applyTreatments } from "./privacy";
import {
  edgeValueFor,
  personaFrom,
  placeFrom,
  valueFor,
  type RowContext,
} from "./values";

/**
 * The generator. Two passes:
 *
 * 1. Every entity gets its rows, each field from its semantic generator,
 *    with uniqueness, null rates, enums and ranges honoured. Foreign keys
 *    are left as placeholders.
 * 2. Foreign keys are resolved against the generated parents (skewed or
 *    uniform popularity, one-to-one kept distinct, self-references pointing
 *    at earlier rows so trees have roots), then rules are applied.
 *
 * Two passes mean cycles between tables never block generation. Everything
 * draws from forked streams of one seed, so adding an entity does not
 * reshuffle the data of the others.
 */

export interface GenerateOptions {
  seed: number | string;
  /** Fixed clock for reproducible dates; defaults to the real time. */
  now?: Date;
}

interface FkSlot {
  entity: string;
  rowIndex: number;
  field: Field;
}

const EDGE_ROWS_PER_ENTITY = 6;

function semanticOf(field: Field) {
  return field.semantic ?? inferSemantic(field.name, field.type);
}

function overridesFor(
  scenario: Scenario,
  entityId: string,
): ScenarioOverride[] {
  return (scenario.overrides ?? []).filter((o) => o.entity === entityId);
}

function applyOverride(
  override: ScenarioOverride,
  rng: Rng,
  current: unknown,
): unknown {
  if (!rng.chance(override.share ?? 1)) return current;
  if (override.nullRate !== undefined && rng.chance(override.nullRate)) {
    return null;
  }
  if (override.weights && Object.keys(override.weights).length) {
    const keys = Object.keys(override.weights);
    return rng.weighted(
      keys,
      keys.map((k) => override.weights?.[k] ?? 0),
    );
  }
  if (override.values?.length) return rng.pick(override.values);
  return current;
}

/** Make `value` unique within `seen` by appending a counter, type-aware. */
function uniquify(
  value: unknown,
  field: Field,
  seen: Set<string>,
  attempt: number,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "number") {
    // Stay inside a declared range: step from the bottom, then wrap.
    if (field.max !== undefined) {
      const lo = field.min ?? 0;
      const span = Math.max(1, Math.floor(field.max - lo) + 1);
      const step = field.type === "integer" ? 1 : 0.01;
      const shifted = lo + ((value - lo + attempt * step) % span);
      return field.type === "integer"
        ? Math.round(shifted)
        : Number(shifted.toFixed(field.scale ?? 2));
    }
    return value + attempt * 100003;
  }
  if (
    typeof value === "string" &&
    (field.type === "date" || field.type === "datetime")
  ) {
    // Dates stay valid dates: move by a day (or a second).
    const t = Date.parse(value);
    if (!Number.isNaN(t)) {
      const d = new Date(
        t + attempt * (field.type === "date" ? 86_400_000 : 1000),
      );
      return field.type === "date"
        ? d.toISOString().slice(0, 10)
        : d.toISOString();
    }
  }
  if (typeof value === "string") {
    if (semanticOf(field) === "email") {
      const [local, domain] = value.split("@");
      return `${local}+${attempt}@${domain ?? "example.com"}`;
    }
    const suffix = `-${attempt}`;
    const max = field.maxLength;
    const base = max ? value.slice(0, Math.max(1, max - suffix.length)) : value;
    return `${base}${suffix}`;
  }
  return value;
}

function keyOf(value: unknown): string {
  return typeof value === "string"
    ? `s:${value}`
    : `j:${JSON.stringify(value)}`;
}

/**
 * The value as the field's declared type. A meaning guessed from a name
 * (memory_gb read as text, a cost_center profiled from numbers) must never
 * put a word in an integer column or a number in a text one.
 */
export function conformToType(field: Field, value: unknown, rng: Rng): unknown {
  if (value === null || value === undefined) return value;
  const lo = field.min ?? 0;
  const hi = field.max ?? (field.type === "integer" ? 1000 : 1000);
  switch (field.type) {
    case "integer": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? Math.round(n) : rng.int(lo, Math.max(lo, hi));
    }
    case "decimal":
    case "float": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n)) return n;
      const v = lo + rng.next() * (Math.max(lo, hi) - lo);
      return Number(v.toFixed(field.scale ?? 2));
    }
    case "boolean":
      return typeof value === "boolean" ? value : rng.chance(0.5);
    case "enum":
      return field.enumValues?.length &&
        !field.enumValues.includes(String(value))
        ? rng.pick(field.enumValues)
        : value;
    case "string":
    case "text":
      return typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : value;
    default:
      return value;
  }
}

function generatePrimaryKey(field: Field, index: number, rng: Rng): unknown {
  // Keys drawn from a declared list keep its values (rows are capped to
  // the list's length in clampScenario).
  if (field.enumValues?.length) {
    return field.enumValues[index % field.enumValues.length];
  }
  if (field.type === "integer") return index + 1;
  if (field.type === "uuid" || semanticOf(field) === "uuid")
    return uuidFrom(rng);
  if (field.type === "string") {
    // cuid-ish: sortable, readable, unique within the run.
    return `c${rng.seed.toString(36).slice(0, 4)}${index.toString(36).padStart(6, "0")}${uuidFrom(rng).slice(0, 8)}`;
  }
  return index + 1;
}

function generateEntityRows(
  entity: Entity,
  count: number,
  scenario: Scenario,
  rng: Rng,
  now: Date,
  fkSlots: FkSlot[],
): { rows: Row[]; edgeRows: number[]; warnings: string[] } {
  const rows: Row[] = [];
  const edgeRows: number[] = [];
  const warnings: string[] = [];
  const pk = primaryKeyOf(entity);
  const seenUnique = new Map<string, Set<string>>();
  const uniqueFields = entity.fields.filter((f) => f.unique || f.primaryKey);
  for (const f of uniqueFields) seenUnique.set(f.name, new Set());
  const nullRate = scenario.nullRate ?? 0.1;
  const overrides = overridesFor(scenario, entity.id);
  const edgeCount = scenario.edgeCases
    ? Math.min(EDGE_ROWS_PER_ENTITY, Math.max(0, count))
    : 0;
  const normalCount = Math.max(0, count - edgeCount);

  for (let index = 0; index < count; index++) {
    const isEdge = index >= normalCount;
    const variant = index - normalCount;
    const rowRng = rng.fork(`row-${index}`);
    const ctx: RowContext = {
      rng: rowRng,
      index,
      persona: personaFrom(rowRng.fork("persona"), index),
      place: placeFrom(rowRng.fork("place")),
      now,
    };
    // created_at first so updated_at can follow it.
    const createdField = entity.fields.find(
      (f) => semanticOf(f) === "created_at",
    );
    if (createdField) {
      ctx.createdAt = new Date(
        now.getTime() -
          rowRng.int(0, 730) * 86_400_000 -
          rowRng.int(0, 86_400_000),
      );
    }

    const row: Row = {};
    for (const field of entity.fields) {
      const semantic = semanticOf(field);
      let value: unknown;
      if (field.references) {
        // Resolved in pass 2 against the parent's generated keys.
        value = null;
        fkSlots.push({ entity: entity.id, rowIndex: index, field });
      } else if (field === pk || field.primaryKey) {
        value = generatePrimaryKey(field, index, rowRng.fork("pk"));
      } else if (isEdge) {
        value = conformToType(
          field,
          edgeValueFor(field, semantic, ctx, variant + index),
          ctx.rng,
        );
      } else {
        const nullDist =
          field.distribution?.kind === "null_rate"
            ? field.distribution.rate
            : null;
        const pNull = nullDist ?? (semantic === "deleted_at" ? 0.9 : nullRate);
        if (field.nullable && rowRng.chance(pNull)) {
          value = null;
        } else {
          value = conformToType(field, valueFor(field, semantic, ctx), ctx.rng);
          if (
            typeof value === "string" &&
            field.maxLength &&
            value.length > field.maxLength
          ) {
            value = value.slice(0, field.maxLength);
          }
          if (field.pattern) {
            try {
              const re = new RegExp(field.pattern);
              if (typeof value === "string" && !re.test(value)) {
                // Keep the generated value; the validator reports the
                // pattern so the agent can add a better generator rule.
                warnings.push(
                  `${entity.id}.${field.name}: value may not match pattern ${field.pattern}`,
                );
              }
            } catch {
              warnings.push(
                `${entity.id}.${field.name}: invalid pattern ${field.pattern}`,
              );
            }
          }
        }
      }
      for (const override of overrides) {
        if (override.field === field.name) {
          value = applyOverride(
            override,
            rowRng.fork(`ov-${field.name}`),
            value,
          );
        }
      }
      if (
        (field.unique || field.primaryKey) &&
        !field.references &&
        value !== null &&
        value !== undefined
      ) {
        const seen = seenUnique.get(field.name)!;
        let candidate: unknown = value;
        let attempt = 0;
        while (seen.has(keyOf(candidate)) && attempt < 50) {
          attempt += 1;
          candidate = uniquify(value, field, seen, attempt);
        }
        if (seen.has(keyOf(candidate))) {
          warnings.push(
            `${entity.id}.${field.name}: could not keep unique at row ${index}`,
          );
        }
        seen.add(keyOf(candidate));
        value = candidate;
      }
      row[field.name] = value;
    }
    rows.push(row);
    if (isEdge) edgeRows.push(index);
  }
  // Dedupe warnings: one per field, not one per row.
  return { rows, edgeRows, warnings: [...new Set(warnings)] };
}

function resolveForeignKeys(
  model: DataModel,
  dataset: Dataset,
  slots: FkSlot[],
  scenario: Scenario,
  rng: Rng,
): string[] {
  const warnings: string[] = [];
  const byEntity = new Map(model.entities.map((e) => [e.id, e]));
  // Group by (entity, field) so one-to-one targets can be handed out once.
  const groups = new Map<string, FkSlot[]>();
  for (const slot of slots) {
    const key = `${slot.entity}.${slot.field.name}`;
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  for (const [key, group] of groups) {
    const field = group[0].field;
    const ref = field.references!;
    const parentRows = dataset.tables[ref.entity] ?? [];
    const parentKeys = parentRows.map((r) => r[ref.field]);
    const groupRng = rng.fork(`fk-${key}`);
    if (parentKeys.length === 0) {
      if (!field.nullable) {
        warnings.push(`${key}: no ${ref.entity} rows to reference; left null`);
      }
      continue;
    }
    const selfRef = ref.entity === group[0].entity;
    const skewed = scenario.parentDistribution === "skewed";
    // A skewed world still needs a stable ordering of "popular" parents.
    const popularity = skewed
      ? groupRng.shuffle(parentKeys.map((_, i) => i))
      : null;
    let distinctPool: number[] | null = null;
    if (field.unique) {
      distinctPool = groupRng.shuffle(parentKeys.map((_, i) => i));
      if (distinctPool.length < group.length) {
        warnings.push(
          `${key}: one-to-one but only ${distinctPool.length} ${ref.entity} rows for ${group.length} children; extra rows left null`,
        );
      }
    }
    const optionalNullRate = field.nullable ? (scenario.nullRate ?? 0.1) : 0;
    for (const slot of group) {
      const row = dataset.tables[slot.entity][slot.rowIndex];
      if (optionalNullRate && groupRng.chance(optionalNullRate)) {
        row[field.name] = null;
        continue;
      }
      let index: number | null;
      if (distinctPool) {
        index = distinctPool.length ? distinctPool.pop()! : null;
      } else if (selfRef) {
        // Point at an earlier row so trees have roots; the first row is a root.
        index = slot.rowIndex === 0 ? null : groupRng.int(0, slot.rowIndex - 1);
        if (index !== null && !field.nullable && slot.rowIndex === 0) index = 0;
      } else if (popularity) {
        index = popularity[groupRng.skewedIndex(popularity.length)];
      } else {
        index = groupRng.int(0, parentKeys.length - 1);
      }
      row[field.name] = index === null ? null : parentKeys[index];
      if (row[field.name] === null && !field.nullable && !selfRef) {
        warnings.push(`${key}: required reference left null`);
      }
    }
    if (!byEntity.has(ref.entity))
      warnings.push(`${key}: unknown entity ${ref.entity}`);
  }
  return [...new Set(warnings)];
}

function compare(
  a: unknown,
  b: unknown,
  op: "<" | "<=" | ">" | ">=" | "==",
): boolean {
  const toNum = (v: unknown) =>
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number.isNaN(Date.parse(v))
          ? Number(v)
          : Date.parse(v)
        : NaN;
  const x = toNum(a);
  const y = toNum(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return op === "==" ? a === b : true;
  switch (op) {
    case "<":
      return x < y;
    case "<=":
      return x <= y;
    case ">":
      return x > y;
    case ">=":
      return x >= y;
    default:
      return x === y;
  }
}

function sameType(sample: unknown, value: unknown): unknown {
  if (typeof sample === "number" && typeof value === "string") {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  return value;
}

/**
 * Make `fields` unique together across `rows`. A foreign key in the tuple
 * is re-picked from its parent's keys (never perturbed into a dangling
 * reference); a plain field is perturbed. What cannot be made unique (a
 * pool smaller than the row count) is left for the validator to report.
 */
function enforceUniqueTogether(
  entity: Entity,
  fields: string[],
  rows: Row[],
  dataset: Dataset,
  rng: Rng,
): void {
  const seen = new Set<string>();
  const keyFor = (row: Row) => fields.map((f) => keyOf(row[f])).join("|");
  const pools = new Map<string, unknown[]>();
  for (const name of fields) {
    const field = entity.fields.find((f) => f.name === name);
    if (field?.references) {
      pools.set(
        name,
        (dataset.tables[field.references.entity] ?? []).map(
          (r) => r[field.references!.field],
        ),
      );
    }
  }
  const fkFields = fields.filter((f) => pools.has(f));
  const plainFields = fields.filter((f) => !pools.has(f));
  for (const row of rows) {
    let key = keyFor(row);
    let attempt = 0;
    while (seen.has(key) && attempt < 40) {
      attempt += 1;
      if (fkFields.length) {
        // Re-pick the last FK of the tuple from its parent pool.
        const name = fkFields[(attempt - 1) % fkFields.length];
        const pool = pools.get(name)!;
        if (pool.length) row[name] = pool[rng.int(0, pool.length - 1)];
      } else if (plainFields.length) {
        const name = plainFields[plainFields.length - 1];
        const field = entity.fields.find((f) => f.name === name);
        if (!field) break;
        row[name] = uniquify(row[name], field, seen, attempt);
      } else {
        break;
      }
      key = keyFor(row);
    }
    seen.add(key);
  }
}

/** Enforce a rule on generated rows by editing the dependent field. */
function enforceRule(rule: Rule, rows: Row[], entity: Entity, rng: Rng): void {
  const spec = rule.spec;
  switch (spec.kind) {
    case "implies": {
      for (const row of rows) {
        const v = row[spec.if.field];
        const matches =
          spec.if.isNull !== undefined
            ? (v === null || v === undefined) === spec.if.isNull
            : (spec.if.in ?? []).some((x) => String(x) === String(v));
        if (!matches) continue;
        const target = entity.fields.find((f) => f.name === spec.then.field);
        if (!target) continue;
        if (spec.then.isNull === true) row[spec.then.field] = null;
        else if (spec.then.equals !== undefined)
          row[spec.then.field] = spec.then.equals;
        else if (spec.then.in?.length) {
          const cur = row[spec.then.field];
          if (!spec.then.in.some((x) => String(x) === String(cur))) {
            row[spec.then.field] = rng.pick(spec.then.in as unknown[]);
          }
        } else if (
          spec.then.isNull === false &&
          (row[spec.then.field] === null || row[spec.then.field] === undefined)
        ) {
          const ctx: RowContext = {
            rng,
            index: 0,
            persona: personaFrom(rng, 0),
            place: placeFrom(rng),
            now: new Date(),
          };
          row[spec.then.field] = valueFor(target, semanticOf(target), ctx);
        }
      }
      return;
    }
    case "compare": {
      for (const row of rows) {
        const a = row[spec.field];
        const b = row[spec.other];
        if (a === null || a === undefined || b === null || b === undefined)
          continue;
        if (compare(a, b, spec.op)) continue;
        // Move `field` to satisfy the relation against `other`.
        const bNum = typeof b === "number" ? b : Date.parse(String(b));
        const isDate = typeof b === "string" && !Number.isNaN(Date.parse(b));
        const delta = isDate
          ? rng.int(1, 30) * 86_400_000
          : Math.max(1, Math.abs(bNum) * 0.1);
        let next: number;
        switch (spec.op) {
          case "<":
            next = bNum - delta;
            break;
          case "<=":
            next = bNum - (rng.chance(0.3) ? 0 : delta);
            break;
          case ">":
            next = bNum + delta;
            break;
          case ">=":
            next = bNum + (rng.chance(0.3) ? 0 : delta);
            break;
          default:
            next = bNum;
        }
        row[spec.field] = isDate
          ? typeof a === "string" && a.length === 10
            ? new Date(next).toISOString().slice(0, 10)
            : new Date(next).toISOString()
          : typeof a === "number" && Number.isInteger(a)
            ? Math.round(next)
            : Number(next.toFixed(2));
      }
      return;
    }
    case "unique_together": {
      // Handled by enforceUniqueTogether, which can re-pick foreign keys.
      return;
    }
    case "range": {
      for (const row of rows) {
        const v = row[spec.field];
        if (typeof v !== "number") continue;
        const lo = spec.min ?? -Infinity;
        const hi = spec.max ?? Infinity;
        if (v < lo) row[spec.field] = Number.isInteger(v) ? Math.ceil(lo) : lo;
        if (v > hi) row[spec.field] = Number.isInteger(v) ? Math.floor(hi) : hi;
      }
      return;
    }
    case "pattern":
    default:
      // Patterns are reported by the validator; there is no generic way to
      // synthesise a string for an arbitrary regular expression.
      break;
  }
}

export function generateDataset(
  model: DataModel,
  scenarioInput: Scenario,
  options: GenerateOptions,
): Dataset {
  const scenario = clampScenario(scenarioInput, model);
  const rng = createRng(options.seed);
  const now = options.now ?? new Date();
  const order = insertionOrder(model);
  const dataset: Dataset = {
    modelHash: modelHash(model),
    scenarioId: scenario.id,
    seed: rng.seed,
    generatedAt: now.toISOString(),
    order,
    tables: {},
    edgeRows: {},
    warnings: [],
  };
  const slots: FkSlot[] = [];
  const byId = new Map(model.entities.map((e) => [e.id, e]));
  for (const id of order) {
    const entity = byId.get(id)!;
    const count = scenario.counts[id] ?? scenario.defaultCount ?? 10;
    const { rows, edgeRows, warnings } = generateEntityRows(
      entity,
      count,
      scenario,
      rng.fork(`entity-${id}`),
      now,
      slots,
    );
    dataset.tables[id] = rows;
    dataset.edgeRows[id] = edgeRows;
    dataset.warnings.push(...warnings);
  }
  dataset.warnings.push(
    ...resolveForeignKeys(model, dataset, slots, scenario, rng),
  );
  // Composite uniqueness after FKs exist, so a duplicate (order, product)
  // pair is fixed by picking another real product, not an invented one.
  for (const entity of model.entities) {
    const rows = dataset.tables[entity.id] ?? [];
    for (const tuple of entity.uniqueTogether ?? []) {
      enforceUniqueTogether(
        entity,
        tuple,
        rows,
        dataset,
        rng.fork(`ut-${entity.id}-${tuple.join("+")}`),
      );
    }
    for (const rule of model.rules) {
      if (rule.entity !== entity.id || rule.spec.kind !== "unique_together")
        continue;
      enforceUniqueTogether(
        entity,
        rule.spec.fields,
        rows,
        dataset,
        rng.fork(`ut-rule-${rule.id}`),
      );
    }
  }
  // Rules run per entity after FKs so "compare" can see every value.
  for (const rule of model.rules) {
    const entity = byId.get(rule.entity);
    if (!entity) continue;
    enforceRule(
      rule,
      dataset.tables[rule.entity] ?? [],
      entity,
      rng.fork(`rule-${rule.id}`),
    );
  }
  // Mask / redact choices last, so rules and keys saw real-looking values.
  for (const entity of model.entities) {
    const treated = applyTreatments(
      entity,
      dataset.tables[entity.id] ?? [],
      dataset.seed,
    );
    for (const name of treated) {
      const field = entity.fields.find((f) => f.name === name);
      if (field?.unique) {
        dataset.warnings.push(
          `${entity.id}.${name}: masked, generalized or redacted, so values are not kept unique (pseudonymize keeps them unique)`,
        );
      }
    }
  }
  // Implications may have changed typed values to strings; coerce back.
  for (const entity of model.entities) {
    for (const field of entity.fields) {
      if (
        field.type !== "integer" &&
        field.type !== "float" &&
        field.type !== "decimal"
      )
        continue;
      const rows = dataset.tables[entity.id] ?? [];
      const sample = rows.find((r) => typeof r[field.name] === "number")?.[
        field.name
      ];
      if (sample === undefined) continue;
      for (const row of rows)
        row[field.name] = sameType(sample, row[field.name]);
    }
  }
  // Cycles: a parent generated after its child is fine for the generator,
  // but the exporter should still insert what it can first.
  for (const rel of relationsOf(model)) {
    if (
      order.indexOf(rel.fromEntity) < order.indexOf(rel.toEntity) &&
      rel.fromEntity !== rel.toEntity
    ) {
      dataset.warnings.push(
        `cycle: ${rel.fromEntity} inserted before ${rel.toEntity}; use deferred constraints or a two-step load`,
      );
    }
  }
  dataset.warnings = [...new Set(dataset.warnings)];
  return dataset;
}

/** Row counts per entity plus the total. */
export function datasetSummary(dataset: Dataset): {
  total: number;
  perEntity: Record<string, number>;
} {
  const perEntity: Record<string, number> = {};
  let total = 0;
  for (const [id, rows] of Object.entries(dataset.tables)) {
    perEntity[id] = rows.length;
    total += rows.length;
  }
  return { total, perEntity };
}
