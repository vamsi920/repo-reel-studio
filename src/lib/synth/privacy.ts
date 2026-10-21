import type { DataModel, Entity, Field, PiiClass, Row } from "./model";
import { createRng, hashString } from "./rng";
import { inferSemantic, piiClassOf } from "./semantics";
import { personaFrom, placeFrom, valueFor, type RowContext } from "./values";

/**
 * Privacy: which fields carry personal data, and how to replace real values
 * with synthetic ones while keeping the data usable (joins still work, the
 * same real value maps to the same fake value everywhere).
 */

export interface PiiFinding {
  entity: string;
  field: string;
  pii: PiiClass;
  semantic: string;
  strategy: "replace" | "hash" | "null" | "keep";
}

export interface PrivacyReport {
  findings: PiiFinding[];
  counts: Record<PiiClass, number>;
  /** Entities with at least one direct identifier. */
  entitiesWithPii: string[];
}

function strategyFor(field: Field, pii: PiiClass): PiiFinding["strategy"] {
  if (pii === "none") return "keep";
  if (field.primaryKey || field.references) return "keep";
  const semantic = field.semantic ?? inferSemantic(field.name, field.type);
  if (semantic === "password_hash" || semantic === "token") return "hash";
  if (
    pii === "sensitive" &&
    (field.type === "integer" ||
      field.type === "float" ||
      field.type === "decimal")
  ) {
    return "replace";
  }
  return "replace";
}

export function privacyReport(model: DataModel): PrivacyReport {
  const findings: PiiFinding[] = [];
  const counts: Record<PiiClass, number> = {
    direct: 0,
    quasi: 0,
    sensitive: 0,
    none: 0,
  };
  const entitiesWithPii = new Set<string>();
  for (const entity of model.entities) {
    for (const field of entity.fields) {
      const pii = piiClassOf(field);
      counts[pii] += 1;
      if (pii === "none") continue;
      if (pii === "direct") entitiesWithPii.add(entity.id);
      findings.push({
        entity: entity.id,
        field: field.name,
        pii,
        semantic: field.semantic ?? inferSemantic(field.name, field.type),
        strategy: strategyFor(field, pii),
      });
    }
  }
  return { findings, counts, entitiesWithPii: [...entitiesWithPii] };
}

/**
 * Replace personal values in `rows` of `entity`. Deterministic per
 * (seed, original value): the same email in two tables becomes the same
 * synthetic email, so joins on it survive. Nulls stay null, keys stay keys.
 */
export function maskRows(
  entity: Entity,
  rows: Row[],
  seed: number | string,
  now: Date = new Date(),
): { rows: Row[]; masked: number } {
  const plan = new Map<string, PiiFinding>();
  for (const f of privacyReport({ entities: [entity], rules: [], flows: [] })
    .findings) {
    plan.set(f.field, f);
  }
  if (plan.size === 0) return { rows, masked: 0 };
  let masked = 0;
  const out = rows.map((row, index) => {
    const next: Row = { ...row };
    for (const field of entity.fields) {
      const finding = plan.get(field.name);
      if (!finding || finding.strategy === "keep") continue;
      const original = row[field.name];
      if (original === null || original === undefined) continue;
      masked += 1;
      const valueSeed = hashString(`${seed}:${field.name}:${String(original)}`);
      const rng = createRng(valueSeed);
      if (finding.strategy === "hash") {
        next[field.name] = `masked_${valueSeed.toString(16)}`;
        continue;
      }
      if (finding.strategy === "null") {
        next[field.name] = null;
        continue;
      }
      const ctx: RowContext = {
        rng,
        index,
        persona: personaFrom(rng.fork("persona"), valueSeed % 997),
        place: placeFrom(rng.fork("place")),
        now,
      };
      next[field.name] = valueFor(
        field,
        field.semantic ?? inferSemantic(field.name, field.type),
        ctx,
      );
    }
    return next;
  });
  return { rows: out, masked };
}

/** Human-readable privacy summary, written next to a run. */
export function privacyReportMarkdown(report: PrivacyReport): string {
  const lines = [
    "# Privacy report",
    "",
    `Direct identifiers: ${report.counts.direct} · Quasi-identifiers: ${report.counts.quasi} · Sensitive: ${report.counts.sensitive} · Other: ${report.counts.none}`,
    "",
    "Every value in this dataset is synthetic. No real record was sampled; the fields below are the ones that would carry personal data in production and were generated from scratch.",
    "",
    "| Entity | Field | Class | Meaning | Strategy |",
    "| --- | --- | --- | --- | --- |",
    ...report.findings.map(
      (f) =>
        `| ${f.entity} | ${f.field} | ${f.pii} | ${f.semantic} | ${f.strategy} |`,
    ),
    "",
  ];
  return lines.join("\n");
}
