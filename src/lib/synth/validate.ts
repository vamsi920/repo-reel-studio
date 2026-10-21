import {
  type DataModel,
  type Dataset,
  type Entity,
  type Field,
  type Row,
  type Rule,
} from "./model";

/**
 * Checks a dataset against the model it claims to follow. The generator is
 * supposed to get all of this right; the validator is what proves it, and
 * what catches a rule or constraint the generator cannot satisfy (two
 * contradicting rules, a one-to-one with too few parents). Every check is
 * reported, passed or not, so the user sees what was verified.
 */

export interface ValidationCheck {
  id: string;
  kind:
    | "not_null"
    | "unique"
    | "enum"
    | "foreign_key"
    | "range"
    | "max_length"
    | "pattern"
    | "type"
    | "rule"
    | "unique_together";
  entity: string;
  field?: string;
  label: string;
  passed: boolean;
  failures: number;
  rows: number;
  samples: string[];
}

export interface ValidationReport {
  ok: boolean;
  checks: ValidationCheck[];
  checksTotal: number;
  checksPassed: number;
  rowsTotal: number;
  at: string;
}

const MAX_SAMPLES = 3;

function key(value: unknown): string {
  return typeof value === "string"
    ? `s:${value}`
    : `j:${JSON.stringify(value)}`;
}

function sample(samples: string[], text: string) {
  if (samples.length < MAX_SAMPLES) samples.push(text);
}

function typeOk(field: Field, value: unknown): boolean {
  if (value === null || value === undefined) return true;
  switch (field.type) {
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "float":
    case "decimal":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    case "datetime":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "time":
      return typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value);
    case "uuid":
      return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
    case "json":
      return typeof value === "object";
    case "array":
      return Array.isArray(value);
    case "string":
    case "text":
    case "enum":
      return typeof value === "string";
    default:
      return true;
  }
}

function checkField(
  entity: Entity,
  field: Field,
  rows: Row[],
  dataset: Dataset,
  model: DataModel,
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const base = `${entity.id}.${field.name}`;
  const make = (
    kind: ValidationCheck["kind"],
    label: string,
    failures: number,
    samples: string[],
  ): ValidationCheck => ({
    id: `${kind}:${base}`,
    kind,
    entity: entity.id,
    field: field.name,
    label,
    passed: failures === 0,
    failures,
    rows: rows.length,
    samples,
  });

  // type
  {
    let failures = 0;
    const samples: string[] = [];
    rows.forEach((row, i) => {
      if (!typeOk(field, row[field.name])) {
        failures += 1;
        sample(samples, `row ${i}: ${JSON.stringify(row[field.name])}`);
      }
    });
    checks.push(make("type", `${base} is ${field.type}`, failures, samples));
  }
  if (!field.nullable) {
    let failures = 0;
    const samples: string[] = [];
    rows.forEach((row, i) => {
      const v = row[field.name];
      if (v === null || v === undefined) {
        failures += 1;
        sample(samples, `row ${i}`);
      }
    });
    checks.push(make("not_null", `${base} is never null`, failures, samples));
  }
  if (field.unique || field.primaryKey) {
    const seen = new Set<string>();
    let failures = 0;
    const samples: string[] = [];
    rows.forEach((row, i) => {
      const v = row[field.name];
      if (v === null || v === undefined) return;
      const k = key(v);
      if (seen.has(k)) {
        failures += 1;
        sample(samples, `row ${i}: ${JSON.stringify(v)}`);
      }
      seen.add(k);
    });
    checks.push(make("unique", `${base} is unique`, failures, samples));
  }
  if (field.enumValues?.length) {
    const allowed = new Set(field.enumValues.map(String));
    let failures = 0;
    const samples: string[] = [];
    rows.forEach((row, i) => {
      const v = row[field.name];
      if (v === null || v === undefined) return;
      if (!allowed.has(String(v))) {
        failures += 1;
        sample(samples, `row ${i}: ${JSON.stringify(v)}`);
      }
    });
    checks.push(
      make(
        "enum",
        `${base} in {${field.enumValues.slice(0, 5).join(", ")}${field.enumValues.length > 5 ? ", …" : ""}}`,
        failures,
        samples,
      ),
    );
  }
  if (field.references) {
    const parent = dataset.tables[field.references.entity] ?? [];
    const refField = field.references.field;
    const keys = new Set(parent.map((r) => key(r[refField])));
    let failures = 0;
    const samples: string[] = [];
    rows.forEach((row, i) => {
      const v = row[field.name];
      if (v === null || v === undefined) return;
      if (!keys.has(key(v))) {
        failures += 1;
        sample(samples, `row ${i}: ${JSON.stringify(v)}`);
      }
    });
    const known = model.entities.some((e) => e.id === field.references?.entity);
    checks.push(
      make(
        "foreign_key",
        `${base} → ${field.references.entity}.${refField}`,
        known ? failures : rows.length,
        known ? samples : ["unknown entity"],
      ),
    );
  }
  if (field.min !== undefined || field.max !== undefined) {
    let failures = 0;
    const samples: string[] = [];
    rows.forEach((row, i) => {
      const v = row[field.name];
      if (typeof v !== "number") return;
      if (
        (field.min !== undefined && v < field.min) ||
        (field.max !== undefined && v > field.max)
      ) {
        failures += 1;
        sample(samples, `row ${i}: ${v}`);
      }
    });
    checks.push(
      make(
        "range",
        `${base} within [${field.min ?? "-∞"}, ${field.max ?? "∞"}]`,
        failures,
        samples,
      ),
    );
  }
  if (field.maxLength) {
    let failures = 0;
    const samples: string[] = [];
    rows.forEach((row, i) => {
      const v = row[field.name];
      if (typeof v === "string" && v.length > field.maxLength!) {
        failures += 1;
        sample(samples, `row ${i}: ${v.length} chars`);
      }
    });
    checks.push(
      make(
        "max_length",
        `${base} ≤ ${field.maxLength} chars`,
        failures,
        samples,
      ),
    );
  }
  if (field.pattern) {
    let re: RegExp | null = null;
    try {
      re = new RegExp(field.pattern);
    } catch {
      re = null;
    }
    let failures = 0;
    const samples: string[] = [];
    if (re) {
      rows.forEach((row, i) => {
        const v = row[field.name];
        if (typeof v === "string" && !re!.test(v)) {
          failures += 1;
          sample(samples, `row ${i}: ${JSON.stringify(v)}`);
        }
      });
    } else {
      failures = rows.length;
      samples.push("invalid regular expression");
    }
    checks.push(
      make("pattern", `${base} matches /${field.pattern}/`, failures, samples),
    );
  }
  return checks;
}

function compareValues(a: unknown, b: unknown, op: string): boolean {
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
  if (Number.isNaN(x) || Number.isNaN(y)) return op === "==" ? a === b : false;
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

export function checkRule(rule: Rule, rows: Row[]): ValidationCheck {
  const spec = rule.spec;
  let failures = 0;
  const samples: string[] = [];
  const isNull = (v: unknown) => v === null || v === undefined;
  switch (spec.kind) {
    case "implies":
      rows.forEach((row, i) => {
        const v = row[spec.if.field];
        const matches =
          spec.if.isNull !== undefined
            ? isNull(v) === spec.if.isNull
            : (spec.if.in ?? []).some((x) => String(x) === String(v));
        if (!matches) return;
        const t = row[spec.then.field];
        let ok = true;
        if (spec.then.isNull !== undefined && isNull(t) !== spec.then.isNull)
          ok = false;
        if (
          spec.then.equals !== undefined &&
          String(t) !== String(spec.then.equals)
        )
          ok = false;
        if (
          spec.then.in?.length &&
          !spec.then.in.some((x) => String(x) === String(t))
        )
          ok = false;
        if (!ok) {
          failures += 1;
          sample(
            samples,
            `row ${i}: ${spec.if.field}=${JSON.stringify(v)}, ${spec.then.field}=${JSON.stringify(t)}`,
          );
        }
      });
      break;
    case "compare":
      rows.forEach((row, i) => {
        const a = row[spec.field];
        const b = row[spec.other];
        if (isNull(a) || isNull(b)) return;
        if (!compareValues(a, b, spec.op)) {
          failures += 1;
          sample(
            samples,
            `row ${i}: ${JSON.stringify(a)} ${spec.op} ${JSON.stringify(b)}`,
          );
        }
      });
      break;
    case "unique_together": {
      const seen = new Set<string>();
      rows.forEach((row, i) => {
        const k = spec.fields.map((f) => key(row[f])).join("|");
        if (seen.has(k)) {
          failures += 1;
          sample(samples, `row ${i}: ${k}`);
        }
        seen.add(k);
      });
      break;
    }
    case "range":
      rows.forEach((row, i) => {
        const v = row[spec.field];
        if (typeof v !== "number") return;
        if (
          (spec.min !== undefined && v < spec.min) ||
          (spec.max !== undefined && v > spec.max)
        ) {
          failures += 1;
          sample(samples, `row ${i}: ${v}`);
        }
      });
      break;
    case "pattern": {
      let re: RegExp | null = null;
      try {
        re = new RegExp(spec.pattern);
      } catch {
        re = null;
      }
      if (!re) {
        failures = rows.length;
        samples.push("invalid regular expression");
        break;
      }
      rows.forEach((row, i) => {
        const v = row[spec.field];
        if (typeof v === "string" && !re!.test(v)) {
          failures += 1;
          sample(samples, `row ${i}: ${JSON.stringify(v)}`);
        }
      });
      break;
    }
    default:
      break;
  }
  return {
    id: `rule:${rule.id}`,
    kind: spec.kind === "unique_together" ? "unique_together" : "rule",
    entity: rule.entity,
    label: rule.description,
    passed: failures === 0,
    failures,
    rows: rows.length,
    samples,
  };
}

export function validateDataset(
  model: DataModel,
  dataset: Dataset,
): ValidationReport {
  const checks: ValidationCheck[] = [];
  let rowsTotal = 0;
  for (const entity of model.entities) {
    const rows = dataset.tables[entity.id] ?? [];
    rowsTotal += rows.length;
    for (const field of entity.fields) {
      checks.push(...checkField(entity, field, rows, dataset, model));
    }
    for (const tuple of entity.uniqueTogether ?? []) {
      checks.push(
        checkRule(
          {
            id: `${entity.id}:${tuple.join("+")}`,
            entity: entity.id,
            description: `${entity.id}: (${tuple.join(", ")}) unique together`,
            spec: { kind: "unique_together", fields: tuple },
          },
          rows,
        ),
      );
    }
  }
  for (const rule of model.rules) {
    checks.push(checkRule(rule, dataset.tables[rule.entity] ?? []));
  }
  const checksPassed = checks.filter((c) => c.passed).length;
  return {
    ok: checksPassed === checks.length,
    checks,
    checksTotal: checks.length,
    checksPassed,
    rowsTotal,
    at: new Date().toISOString(),
  };
}
