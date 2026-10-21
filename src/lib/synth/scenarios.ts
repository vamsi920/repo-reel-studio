import { insertionOrder, type DataModel, type Scenario } from "./model";

/**
 * Built-in scenarios. The agent (or the user) can add more; these cover the
 * four reasons people generate data: a quick smoke set, a realistic volume
 * with production-like skew, deliberate edge cases, and a load-test volume.
 */
export const BUILTIN_SCENARIO_IDS = [
  "smoke",
  "realistic",
  "edge_cases",
  "load",
] as const;
export type BuiltinScenarioId = (typeof BUILTIN_SCENARIO_IDS)[number];

/** Hard cap for an in-browser run; the exporter streams nothing. */
export const MAX_ROWS_PER_RUN = 250_000;
export const MAX_ROWS_PER_ENTITY = 100_000;

/** Entities that typically have fewer rows than the ones that point at them. */
function isLookupLike(entityId: string): boolean {
  return /(category|categories|status|type|role|plan|tier|country|currency|tag|setting|config)/i.test(
    entityId,
  );
}

function countsFor(model: DataModel, base: number): Record<string, number> {
  const counts: Record<string, number> = {};
  // Children get more rows than parents: a rough fan-out from the relations.
  const parents = new Set<string>();
  for (const e of model.entities) {
    for (const f of e.fields)
      if (f.references) parents.add(f.references.entity);
  }
  for (const e of model.entities) {
    const hasFk = e.fields.some((f) => f.references);
    const oneToOne = e.fields.some((f) => f.references && f.unique);
    let n = base;
    if (isLookupLike(e.id))
      n = Math.max(3, Math.min(12, Math.round(base / 10)));
    else if (oneToOne) n = Math.max(1, Math.round(base * 0.6));
    else if (hasFk && !parents.has(e.id)) n = base * 3;
    else if (hasFk && parents.has(e.id)) n = base * 2;
    counts[e.id] = Math.min(MAX_ROWS_PER_ENTITY, Math.max(1, n));
  }
  return capOneToOne(model, counts);
}

/**
 * A required one-to-one child cannot have more rows than its parent (every
 * child needs a distinct parent). Parents are visited first so a chain of
 * one-to-ones caps correctly.
 */
function capOneToOne(
  model: DataModel,
  counts: Record<string, number>,
): Record<string, number> {
  const capped = { ...counts };
  const byId = new Map(model.entities.map((e) => [e.id, e]));
  for (const id of insertionOrder(model)) {
    const entity = byId.get(id);
    if (!entity) continue;
    for (const field of entity.fields) {
      if (!field.references || !field.unique || field.nullable) continue;
      if (field.references.entity === id) continue;
      const parentCount = capped[field.references.entity];
      if (parentCount !== undefined && capped[id] > parentCount) {
        capped[id] = parentCount;
      }
    }
  }
  return capped;
}

export function builtinScenarios(model: DataModel): Scenario[] {
  return [
    {
      id: "smoke",
      name: "Smoke",
      description:
        "A handful of rows per table. Fast seed for local development and unit tests.",
      counts: countsFor(model, 8),
      defaultCount: 8,
      edgeCases: false,
      nullRate: 0.05,
      parentDistribution: "uniform",
    },
    {
      id: "realistic",
      name: "Realistic",
      description:
        "Production-like volumes and skew: a few busy parents, a long tail, realistic null rates.",
      counts: countsFor(model, 200),
      defaultCount: 200,
      edgeCases: false,
      nullRate: 0.12,
      parentDistribution: "skewed",
    },
    {
      id: "edge_cases",
      name: "Edge cases",
      description:
        "Boundary values, unicode, empty strings, leap days, maximum lengths and nulls wherever allowed.",
      counts: countsFor(model, 20),
      defaultCount: 20,
      edgeCases: true,
      nullRate: 0.3,
      parentDistribution: "uniform",
    },
    {
      id: "load",
      name: "Load",
      description:
        "Large volumes for performance and pagination tests, generated with the realistic skew.",
      counts: countsFor(model, 5_000),
      defaultCount: 5_000,
      edgeCases: false,
      nullRate: 0.1,
      parentDistribution: "skewed",
    },
  ];
}

export function totalRows(scenario: Scenario, model: DataModel): number {
  return model.entities.reduce(
    (sum, e) => sum + (scenario.counts[e.id] ?? scenario.defaultCount ?? 10),
    0,
  );
}

/** Returns the scenario with its counts clamped to the per-run limits. */
export function clampScenario(scenario: Scenario, model: DataModel): Scenario {
  const counts: Record<string, number> = {};
  for (const e of model.entities) {
    const n = scenario.counts[e.id] ?? scenario.defaultCount ?? 10;
    counts[e.id] = Math.min(MAX_ROWS_PER_ENTITY, Math.max(0, Math.floor(n)));
  }
  let total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total > MAX_ROWS_PER_RUN) {
    const factor = MAX_ROWS_PER_RUN / total;
    for (const id of Object.keys(counts)) {
      counts[id] = Math.max(1, Math.floor(counts[id] * factor));
    }
    total = Object.values(counts).reduce((a, b) => a + b, 0);
  }
  return { ...scenario, counts: capOneToOne(model, counts) };
}
